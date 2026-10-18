import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReminderService } from './reminder.service';
import {
  AppointmentReminder,
  ReminderStatus,
  ReminderType,
} from '../entities/appointment-reminder.entity';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let reminderRepository: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let appointmentRepository: { findOne: jest.Mock };
  let patientRepository: { findOne: jest.Mock };
  let notificationsService: { sendReminderEmail: jest.Mock };

  beforeEach(async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ tenantId: 'tenant-1' }]),
    };
    reminderRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    appointmentRepository = { findOne: jest.fn() };
    patientRepository = { findOne: jest.fn() };
    notificationsService = { sendReminderEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: getRepositoryToken(AppointmentReminder), useValue: reminderRepository },
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepository },
        { provide: getRepositoryToken(Patient), useValue: patientRepository },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(ReminderService);
  });

  it('processes a due email reminder using the patient email address', async () => {
    const reminder: Partial<AppointmentReminder> = {
      id: 'reminder-1',
      tenantId: 'tenant-1',
      appointmentId: 'appointment-1',
      type: ReminderType.EMAIL,
      status: ReminderStatus.PENDING,
      scheduledTime: new Date(Date.now() - 60_000),
      message: 'Appointment reminder content',
      retryCount: 0,
      updatedAt: new Date(),
    };
    reminderRepository.find.mockResolvedValue([reminder]);
    reminderRepository.findOne.mockResolvedValue(reminder);
    reminderRepository.save.mockImplementation(async (entity) => entity);
    appointmentRepository.findOne.mockResolvedValue({
      id: 'appointment-1',
      tenantId: 'tenant-1',
      patientId: 'patient-1',
    });
    patientRepository.findOne.mockResolvedValue({
      id: 'patient-1',
      email: 'patient@example.test',
    });

    await service.processReminders();

    expect(notificationsService.sendReminderEmail).toHaveBeenCalledWith(
      'patient@example.test',
      'Appointment reminder',
      'Appointment reminder content',
    );
    expect(reminder.status).toBe(ReminderStatus.SENT);
  });

  it('does not retry a failed reminder before its backoff expires', async () => {
    reminderRepository.find.mockResolvedValue([
      {
        id: 'reminder-failed',
        tenantId: 'tenant-1',
        status: ReminderStatus.FAILED,
        scheduledTime: new Date(Date.now() - 60_000),
        retryCount: 1,
        updatedAt: new Date(),
      },
    ]);

    await expect(service.getPendingReminders('tenant-1')).resolves.toEqual([]);
  });
});
