import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { AppointmentWaitlist, WaitlistStatus } from '../entities/appointment-waitlist.entity';
import { Appointment, AppointmentStatus, AppointmentType, MedicalPriority } from '../entities/appointment.entity';
import { AppointmentService } from './appointment.service';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  manager: { transaction: jest.fn() },
});

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'appt-1',
    doctorId: 'doc-1',
    patientId: 'patient-1',
    appointmentDate: new Date('2026-08-10T09:00:00Z'),
    status: AppointmentStatus.CANCELLED,
    type: AppointmentType.ROUTINE,
    priority: MedicalPriority.NORMAL,
    duration: 30,
    ...overrides,
  } as Appointment);

describe('WaitlistService', () => {
  let service: WaitlistService;
  let repo: ReturnType<typeof mockRepo>;
  let appointmentRepo: ReturnType<typeof mockRepo>;
  let appointmentService: { create: jest.Mock };

  beforeEach(async () => {
    appointmentService = { create: jest.fn() };
    const transactionManager = {
      getRepository: jest.fn((entity) =>
        entity === AppointmentWaitlist ? repo : appointmentRepo,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: getRepositoryToken(AppointmentWaitlist), useFactory: mockRepo },
        { provide: getRepositoryToken(Appointment), useFactory: mockRepo },
        { provide: AppointmentService, useValue: appointmentService },
      ],
    }).compile();

    service = module.get(WaitlistService);
    repo = module.get(getRepositoryToken(AppointmentWaitlist));
    appointmentRepo = module.get(getRepositoryToken(Appointment));
    repo.manager.transaction.mockImplementation((callback) => callback(transactionManager));
  });

  describe('join', () => {
    it('creates a WAITING entry', async () => {
      const entry: Partial<AppointmentWaitlist> = {
        id: 'wl-1',
        patientId: 'p1',
        doctorId: 'doc-1',
        status: WaitlistStatus.WAITING,
        responseWindowMinutes: 30,
      };
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);

      const result = await service.join('p1', {
        doctorId: 'doc-1',
        preferredDateStart: '2026-08-01T00:00:00Z',
        preferredDateEnd: '2026-08-31T00:00:00Z',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p1', doctorId: 'doc-1', status: WaitlistStatus.WAITING }),
      );
      expect(result.status).toBe(WaitlistStatus.WAITING);
    });
  });

  describe('leave', () => {
    it('sets status to CANCELLED', async () => {
      const entry = { id: 'wl-1', patientId: 'p1', status: WaitlistStatus.WAITING };
      repo.findOne.mockResolvedValue(entry);
      repo.save.mockResolvedValue({ ...entry, status: WaitlistStatus.CANCELLED });

      await service.leave('p1', 'wl-1');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: WaitlistStatus.CANCELLED }));
    });

    it('throws NotFoundException when entry not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.leave('p1', 'wl-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('notifyNextEligible', () => {
    it('notifies the earliest waiting patient and returns the entry', async () => {
      const candidate: Partial<AppointmentWaitlist> = {
        id: 'wl-2',
        patientId: 'p2',
        doctorId: 'doc-1',
        status: WaitlistStatus.WAITING,
        preferredDateStart: new Date('2026-08-01T00:00:00Z'),
        preferredDateEnd: new Date('2026-08-31T00:00:00Z'),
        responseWindowMinutes: 30,
      };
      // No stale NOTIFIED entries
      repo.find
        .mockResolvedValueOnce([]) // expireStaleOffers: NOTIFIED entries
        .mockResolvedValueOnce([candidate]); // eligible candidates
      repo.save.mockResolvedValue({ ...candidate, status: WaitlistStatus.NOTIFIED, offeredAppointmentId: 'appt-1' });

      const result = await service.notifyNextEligible(makeAppointment());

      expect(result).not.toBeNull();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.NOTIFIED, offeredAppointmentId: 'appt-1' }),
      );
    });

    it('returns null when no candidates are waiting', async () => {
      repo.find
        .mockResolvedValueOnce([]) // stale check
        .mockResolvedValueOnce([]); // no candidates

      const result = await service.notifyNextEligible(makeAppointment());
      expect(result).toBeNull();
    });

    it('expires stale NOTIFIED entries before searching candidates', async () => {
      const stale: Partial<AppointmentWaitlist> = {
        id: 'wl-stale',
        status: WaitlistStatus.NOTIFIED,
        notifiedAt: new Date(Date.now() - 2 * 60 * 60_000), // 2 hours ago
        responseWindowMinutes: 30,
      };
      repo.find
        .mockResolvedValueOnce([stale]) // stale entries
        .mockResolvedValueOnce([]); // no new candidates
      repo.save.mockResolvedValue({ ...stale, status: WaitlistStatus.EXPIRED });

      await service.notifyNextEligible(makeAppointment());

      expect(repo.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ status: WaitlistStatus.EXPIRED })]),
      );
    });
  });

  describe('acceptOffer', () => {
    it('accepts offer, books the appointment for the freed slot, and returns the updated entry', async () => {
      const waitlistEntry: Partial<AppointmentWaitlist> = {
        id: 'wl-1',
        patientId: 'patient-1',
        doctorId: 'doc-1',
        status: WaitlistStatus.NOTIFIED,
        offeredAppointmentId: 'appt-cancelled-1',
        notifiedAt: new Date(),
        responseWindowMinutes: 30,
        preferredDateStart: new Date('2026-08-10T09:00:00Z'),
      };

      const cancelledAppointment = makeAppointment({
        id: 'appt-cancelled-1',
        tenantId: 'tenant-1',
        doctorId: 'doc-1',
        appointmentDate: new Date('2026-08-10T09:00:00Z'),
        startTime: new Date('2026-08-10T09:00:00Z'),
        endTime: new Date('2026-08-10T09:30:00Z'),
        duration: 30,
      });

      repo.findOne.mockResolvedValue(waitlistEntry);
      repo.save.mockImplementation(async (entity) => entity);

      appointmentRepo.findOne.mockResolvedValue(cancelledAppointment);
      appointmentService.create.mockResolvedValue({ id: 'new-appt-1' });

      const result = await service.acceptOffer('patient-1', 'wl-1');

      expect(result.status).toBe(WaitlistStatus.ACCEPTED);
      expect(appointmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: 'patient-1',
          doctorId: 'doc-1',
        }),
        expect.any(Object),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.ACCEPTED }),
      );
    });

    it('leaves the offer notified when the offered slot is no longer available', async () => {
      const waitlistEntry: Partial<AppointmentWaitlist> = {
        id: 'wl-1',
        patientId: 'patient-1',
        doctorId: 'doc-1',
        status: WaitlistStatus.NOTIFIED,
        offeredAppointmentId: 'appt-cancelled-1',
        notifiedAt: new Date(),
        responseWindowMinutes: 30,
        preferredDateStart: new Date('2026-08-10T09:00:00Z'),
      };

      repo.findOne.mockResolvedValue(waitlistEntry);
      appointmentRepo.findOne.mockResolvedValue(makeAppointment());
      appointmentService.create.mockRejectedValue(
        new ConflictException('Time slot conflicts with an existing appointment.'),
      );

      await expect(service.acceptOffer('patient-1', 'wl-1')).rejects.toThrow(ConflictException);

      expect(waitlistEntry.status).toBe(WaitlistStatus.NOTIFIED);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no active notified offer exists', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.acceptOffer('patient-1', 'wl-missing')).rejects.toThrow(NotFoundException);
    });

    it('marks offer as EXPIRED and throws NotFoundException when response window passed', async () => {
      const expiredEntry: Partial<AppointmentWaitlist> = {
        id: 'wl-expired',
        patientId: 'patient-1',
        doctorId: 'doc-1',
        status: WaitlistStatus.NOTIFIED,
        notifiedAt: new Date(Date.now() - 45 * 60_000),
        responseWindowMinutes: 30,
      };

      repo.findOne.mockResolvedValue(expiredEntry);
      repo.save.mockImplementation(async (entity) => entity);

      await expect(service.acceptOffer('patient-1', 'wl-expired')).rejects.toThrow(NotFoundException);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WaitlistStatus.EXPIRED }),
      );
    });
  });
});
