import { Injectable, Logger, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, FindOptionsWhere, Repository } from 'typeorm';
import {
  AppointmentReminder,
  ReminderType,
  ReminderStatus,
} from '../entities/appointment-reminder.entity';
import { Appointment } from '../entities/appointment.entity';
import { TenantContext } from '../../tenant/context/tenant.context';
import { Patient } from '../../patients/entities/patient.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';

const MAX_REMINDER_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;

@Injectable()
export class ReminderService {
  private logger = new Logger(ReminderService.name);

  constructor(
    @InjectRepository(AppointmentReminder)
    private reminderRepository: Repository<AppointmentReminder>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Generates a TypeORM where object that enforces tenant isolation.
   * @private
   */
  private getScopedWhere(baseWhere: FindOptionsWhere<AppointmentReminder> = {}): FindOptionsWhere<AppointmentReminder> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    return {
      ...baseWhere,
      tenantId,
    };
  }

  async scheduleReminder(
    appointmentId: string,
    type: ReminderType,
    hoursBeforeAppointment: number = 24,
  ): Promise<AppointmentReminder> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const appointment = await this.appointmentRepository.findOne({ 
      where: { id: appointmentId, tenantId } 
    });
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const scheduledTime = new Date(
      appointment.appointmentDate.getTime() - hoursBeforeAppointment * 60 * 60 * 1000,
    );

    const patient = await this.patientRepository.findOne({ where: { id: appointment.patientId } });
    if (!patient) {
      throw new Error(`Patient ${appointment.patientId} not found`);
    }

    const reminder = this.reminderRepository.create({
      tenantId,
      appointmentId,
      type,
      scheduledTime,
      message: this.generateReminderMessage(appointment, type),
      recipient: this.getContactForType(patient, type),
    });

    return this.reminderRepository.save(reminder);
  }

  async getPendingReminders(tenantId?: string, now = new Date()): Promise<AppointmentReminder[]> {
    const scope = tenantId ? { tenantId } : this.getScopedWhere();
    const reminders = await this.reminderRepository.find({
      where: [
        { ...scope, status: ReminderStatus.PENDING, scheduledTime: LessThan(now) },
        {
          ...scope,
          status: ReminderStatus.FAILED,
          scheduledTime: LessThan(now),
          retryCount: LessThan(MAX_REMINDER_ATTEMPTS),
        },
      ],
      order: { scheduledTime: 'ASC' },
    });

    return reminders.filter((reminder) => {
      if (reminder.status === ReminderStatus.PENDING) return true;
      const retryDelay = Math.min(
        BASE_RETRY_DELAY_MS * 2 ** Math.max(0, reminder.retryCount - 1),
        MAX_RETRY_DELAY_MS,
      );
      return now.getTime() - reminder.updatedAt.getTime() >= retryDelay;
    });
  }

  async markAsSent(reminderId: string, tenantId?: string): Promise<AppointmentReminder> {
    const reminder = await this.reminderRepository.findOne({ 
      where: tenantId ? { id: reminderId, tenantId } : this.getScopedWhere({ id: reminderId }),
    });
    if (!reminder) {
      throw new Error('Reminder not found');
    }

    reminder.status = ReminderStatus.SENT;
    reminder.sentAt = new Date();

    return this.reminderRepository.save(reminder);
  }

  async markAsFailed(
    reminderId: string,
    errorMessage: string,
    tenantId?: string,
  ): Promise<AppointmentReminder> {
    const reminder = await this.reminderRepository.findOne({ 
      where: tenantId ? { id: reminderId, tenantId } : this.getScopedWhere({ id: reminderId }),
    });
    if (!reminder) {
      throw new Error('Reminder not found');
    }

    reminder.status = ReminderStatus.FAILED;
    reminder.errorMessage = errorMessage;
    reminder.retryCount += 1;

    return this.reminderRepository.save(reminder);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processReminders(): Promise<void> {
    const now = new Date();
    const tenants = await this.reminderRepository
      .createQueryBuilder('reminder')
      .select('DISTINCT reminder.tenantId', 'tenantId')
      .where('reminder.status IN (:...statuses)', {
        statuses: [ReminderStatus.PENDING, ReminderStatus.FAILED],
      })
      .andWhere('reminder.scheduledTime < :now', { now })
      .getRawMany<{ tenantId: string }>();

    for (const { tenantId } of tenants) {
      const pendingReminders = await this.getPendingReminders(tenantId, now);
      for (const reminder of pendingReminders) {
        try {
          await this.sendReminder(reminder);
          await this.markAsSent(reminder.id, tenantId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.markAsFailed(reminder.id, message, tenantId);
          this.logger.warn(`Reminder ${reminder.id} delivery failed; retry count is ${reminder.retryCount + 1}`);
        }
      }
    }
  }

  private async sendReminder(reminder: AppointmentReminder): Promise<void> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id: reminder.appointmentId, tenantId: reminder.tenantId },
    });
    if (!appointment) {
      throw new Error(`Appointment ${reminder.appointmentId} not found for reminder ${reminder.id}`);
    }
    const patient = await this.patientRepository.findOne({ where: { id: appointment.patientId } });
    if (!patient) {
      throw new Error(`Patient ${appointment.patientId} not found for reminder ${reminder.id}`);
    }

    switch (reminder.type) {
      case ReminderType.EMAIL:
        if (!patient.email) throw new Error(`Patient ${patient.id} has no email address`);
        await this.notificationsService.sendReminderEmail(
          patient.email,
          'Appointment reminder',
          reminder.message,
        );
        break;
      case ReminderType.SMS:
        if (!patient.phone) throw new Error(`Patient ${patient.id} has no phone number`);
        await this.notificationsService.sendReminderSms(patient.phone, reminder.message);
        break;
      case ReminderType.PUSH_NOTIFICATION:
        const pushRecipient =
          patient.contactPreferences?.pushUserId ?? patient.email;
        if (!pushRecipient) throw new Error(`Patient ${patient.id} has no push notification contact`);
        await this.notificationsService.sendReminderPush(
          pushRecipient,
          'Appointment reminder',
          reminder.message,
        );
        break;
      case ReminderType.PHONE_CALL:
        throw new ServiceUnavailableException('Phone-call reminders are not supported');
    }
  }

  private getContactForType(patient: Patient, type: ReminderType): string | null {
    switch (type) {
      case ReminderType.EMAIL:
        return patient.email ?? null;
      case ReminderType.SMS:
      case ReminderType.PHONE_CALL:
        return patient.phone ?? null;
      case ReminderType.PUSH_NOTIFICATION:
        return patient.contactPreferences?.pushUserId ?? patient.email ?? null;
    }
    return null;
  }

  private generateReminderMessage(appointment: Appointment, type: ReminderType): string {
    const date = appointment.appointmentDate.toLocaleDateString();
    const time = appointment.appointmentDate.toLocaleTimeString();

    return `Reminder: You have an appointment scheduled for ${date} at ${time}. ${appointment.isTelemedicine ? 'This is a telemedicine appointment.' : 'Please arrive 15 minutes early.'}`;
  }
}
