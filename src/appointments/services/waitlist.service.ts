import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AppointmentWaitlist, WaitlistStatus } from '../entities/appointment-waitlist.entity';
import { Appointment, AppointmentType, MedicalPriority } from '../entities/appointment.entity';
import { JoinWaitlistDto } from '../dto/waitlist.dto';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';

const DEFAULT_RESPONSE_WINDOW_MINUTES = 30;

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(AppointmentWaitlist)
    private readonly waitlistRepo: Repository<AppointmentWaitlist>,
    @Inject(forwardRef(() => AppointmentService))
    private readonly appointmentService: AppointmentService,
  ) {}

  async join(patientId: string, dto: JoinWaitlistDto): Promise<AppointmentWaitlist> {
    const entry = this.waitlistRepo.create({
      patientId,
      doctorId: dto.doctorId,
      preferredDateStart: new Date(dto.preferredDateStart),
      preferredDateEnd: new Date(dto.preferredDateEnd),
      responseWindowMinutes: dto.responseWindowMinutes ?? DEFAULT_RESPONSE_WINDOW_MINUTES,
      status: WaitlistStatus.WAITING,
    });
    return this.waitlistRepo.save(entry);
  }

  async leave(patientId: string, waitlistId: string): Promise<void> {
    const entry = await this.waitlistRepo.findOne({ where: { id: waitlistId, patientId } });
    if (!entry) throw new NotFoundException(`Waitlist entry ${waitlistId} not found`);
    entry.status = WaitlistStatus.CANCELLED;
    await this.waitlistRepo.save(entry);
  }

  async listForPatient(patientId: string): Promise<AppointmentWaitlist[]> {
    return this.waitlistRepo.find({ where: { patientId, status: WaitlistStatus.WAITING } });
  }

  /**
   * Called when an appointment is cancelled. Finds the next eligible waiting
   * patient for the freed slot and marks them as NOTIFIED.
   *
   * Returns the notified entry, or null if no one was waiting.
   */
  async notifyNextEligible(cancelledAppointment: Appointment): Promise<AppointmentWaitlist | null> {
    const slotDate = cancelledAppointment.appointmentDate;

    // Expire any NOTIFIED entries whose response window has passed.
    await this.expireStaleOffers();

    const candidates = await this.waitlistRepo.find({
      where: {
        doctorId: cancelledAppointment.doctorId,
        status: WaitlistStatus.WAITING,
        preferredDateStart: LessThanOrEqual(slotDate),
        preferredDateEnd: MoreThanOrEqual(slotDate),
      },
      order: { createdAt: 'ASC' },
    });

    if (candidates.length === 0) return null;

    const next = candidates[0];
    next.status = WaitlistStatus.NOTIFIED;
    next.offeredAppointmentId = cancelledAppointment.id;
    next.notifiedAt = new Date();
    return this.waitlistRepo.save(next);
  }

  async acceptOffer(patientId: string, waitlistId: string): Promise<AppointmentWaitlist> {
    const result = await this.waitlistRepo.manager.transaction(async (manager) => {
      const entryRepo = manager.getRepository(AppointmentWaitlist);
      const entry = await entryRepo.findOne({
        where: { id: waitlistId, patientId, status: WaitlistStatus.NOTIFIED },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entry) {
        throw new NotFoundException(`No active offer found for waitlist entry ${waitlistId}`);
      }

      const now = Date.now();
      if (entry.notifiedAt && now - entry.notifiedAt.getTime() > entry.responseWindowMinutes * 60_000) {
        entry.status = WaitlistStatus.EXPIRED;
        await entryRepo.save(entry);
        return { expired: true as const };
      }

      let offeredAppointment: Appointment | null = null;
      if (entry.offeredAppointmentId) {
        offeredAppointment = await manager.getRepository(Appointment).findOne({
          where: { id: entry.offeredAppointmentId },
        });
      }

      const appointmentDate =
        offeredAppointment?.startTime ??
        offeredAppointment?.appointmentDate ??
        entry.preferredDateStart;
      const appointmentDto: CreateAppointmentDto = {
        patientId: entry.patientId,
        doctorId: entry.doctorId,
        appointmentDate: appointmentDate.toISOString(),
        duration: offeredAppointment?.duration ?? 30,
        type: offeredAppointment?.type ?? AppointmentType.ROUTINE,
        priority: offeredAppointment?.priority ?? MedicalPriority.NORMAL,
        specialty: offeredAppointment?.specialty ?? undefined,
        roomId: offeredAppointment?.roomId ?? undefined,
        isTelemedicine: offeredAppointment?.isTelemedicine ?? false,
        reason: offeredAppointment?.reason
          ? `Waitlist acceptance: ${offeredAppointment.reason}`
          : 'Booked via waitlist acceptance',
        notes: `Accepted from waitlist entry ${entry.id}`,
      };

      const appointment = await this.appointmentService.create(appointmentDto, manager);
      entry.status = WaitlistStatus.ACCEPTED;
      const savedEntry = await entryRepo.save(entry);
      Object.assign(savedEntry, { appointment });
      return { entry: savedEntry };
    });

    if ('expired' in result) {
      throw new NotFoundException(`Offer for waitlist entry ${waitlistId} has expired`);
    }

    return result.entry;
  }

  private async expireStaleOffers(): Promise<void> {
    const notified = await this.waitlistRepo.find({ where: { status: WaitlistStatus.NOTIFIED } });
    const now = Date.now();
    const stale = notified.filter((e) => {
      if (!e.notifiedAt) return false;
      return now - e.notifiedAt.getTime() > e.responseWindowMinutes * 60_000;
    });
    if (stale.length > 0) {
      await this.waitlistRepo.save(stale.map((e) => ({ ...e, status: WaitlistStatus.EXPIRED })));
    }
  }
}
