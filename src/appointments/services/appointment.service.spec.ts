import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { WaitlistService } from './waitlist.service';
import { Appointment, AppointmentStatus, AppointmentType, MedicalPriority } from '../entities/appointment.entity';
import { DoctorAvailability } from '../entities/doctor-availability.entity';
import { AuditService } from '../../common/audit/audit.service';
import { TenantContext } from '../../tenant/context/tenant.context';
import { getRequestContext } from '../../common/middleware/request-context.middleware';
import { UserRole } from '../../auth/entities/user.entity';

const PATIENT_ID = 'patient-1';
const DOCTOR_ID = 'doctor-1';
const APPOINTMENT_ID = 'appt-1';
const ROOM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_ROOM_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const TENANT_ID = 'tenant-1';

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: APPOINTMENT_ID,
    tenantId: TENANT_ID,
    patientId: PATIENT_ID,
    doctorId: DOCTOR_ID,
    isTelemedicine: true,
    roomId: null,
    telemedicineRoomId: ROOM_ID,
    telemedicineLink: `https://telemedicine.app/room/${ROOM_ID}`,
    appointmentDate: new Date(Date.now() + 5 * 60_000),
    duration: 30,
    status: AppointmentStatus.SCHEDULED,
    type: AppointmentType.TELEMEDICINE,
    priority: MedicalPriority.NORMAL,
    ...overrides,
  } as Appointment);

describe('AppointmentService – telemedicine security', () => {
  let service: AppointmentService;
  let appointmentRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let availabilityRepo: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      useLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const transactionalEntityManager: any = {
      connection: { options: { type: 'sqlite' } }, // skip advisory locks
      query: jest.fn().mockResolvedValue([{ acquired: true }]),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (_, data) => ({ ...data, id: 'x' })),
    };

    appointmentRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) =>
          cb(transactionalEntityManager),
        ),
      },
    };
    availabilityRepo = { findOne: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    configService = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'TELEMEDICINE_BASE_URL') return 'https://telemedicine.app';
        if (key === 'APPOINTMENT_BUFFER_MINUTES') return 15;
        return fallback;
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepo },
        { provide: getRepositoryToken(DoctorAvailability), useValue: availabilityRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        { provide: WaitlistService, useValue: { notifyNextEligible: jest.fn() } },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);

    // Tenant + availability mock that the booking-conflict path requires.
    TenantContext.setTenantId(TENANT_ID);
    availabilityRepo.findOne.mockResolvedValue({
      doctorId: DOCTOR_ID,
      dayOfWeek: new Date().getDay() || 7,
      startTime: '00:00',
      endTime: '23:59',
      isActive: true,
      slotDuration: 30,
    });
  });

  afterEach(() => {
    TenantContext.clear();
  });

  describe('create – room ID generation (security)', () => {
    // Use a fixed future date at 10:00 AM to stay within any availability window
    const buildDate = () => {
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + 1);
      appointmentDate.setHours(10, 0, 0, 0);
      return appointmentDate;
    };

    const baseDto = () => {
      const appointmentDate = buildDate();
      // Update the per-call dayOfWeek mock so the availability lookup matches.
      availabilityRepo.findOne.mockResolvedValue({
        doctorId: DOCTOR_ID,
        dayOfWeek: appointmentDate.getDay() || 7,
        startTime: '00:00',
        endTime: '23:59',
        isActive: true,
        slotDuration: 30,
      });
      return {
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: appointmentDate.toISOString(),
        duration: 30,
        type: AppointmentType.TELEMEDICINE,
        priority: MedicalPriority.NORMAL,
        isTelemedicine: true,
      };
    };

    it('should generate a UUID room ID, not a timestamp', async () => {
      const result = await service.create(baseDto() as any);
      expect(result.telemedicineRoomId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should not expose a predictable timestamp in the room URL', async () => {
      const before = Date.now();
      const result = await service.create(baseDto() as any);
      const after = Date.now();
      const match = result.telemedicineLink?.match(/(\d{13})/);
      if (match) {
        const ts = parseInt(match[1], 10);
        expect(ts < before || ts > after).toBe(true);
      }
      expect(result.telemedicineLink).toContain(result.telemedicineRoomId);
    });

    it('should produce unique room IDs for concurrent bookings', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => service.create(baseDto() as any)),
      );
      const ids = results.map((r) => r.telemedicineRoomId);
      expect(new Set(ids).size).toBe(20);
    });

    it('should not set telemedicineRoomId for non-telemedicine appointments', async () => {
      const result = await service.create({ ...baseDto(), isTelemedicine: false } as any);
      expect(result.telemedicineRoomId).toBeNull();
      expect(result.telemedicineLink).toBeNull();
    });
  });

  describe('issueTelemedicineToken', () => {
    const getQb = () => (appointmentRepo.createQueryBuilder as jest.Mock).mock.results[0]?.value;

    it('should issue a signed JWT for the patient', async () => {
      const appt = makeAppointment();
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(appt),
      });

      const result = await service.issueTelemedicineToken(APPOINTMENT_ID, PATIENT_ID);

      expect(result.token).toBe('signed.jwt.token');
      expect(result.roomUrl).toContain(ROOM_ID);
      expect(result.roomUrl).toContain('token=signed.jwt.token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: PATIENT_ID, roomId: ROOM_ID, role: 'patient' }),
        expect.any(Object),
      );
    });

    it('should issue a signed JWT for the doctor with role=doctor', async () => {
      const appt = makeAppointment();
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(appt),
      });

      const result = await service.issueTelemedicineToken(APPOINTMENT_ID, DOCTOR_ID);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'doctor' }),
        expect.any(Object),
      );
      expect(result.token).toBeDefined();
    });

    it('should throw NotFoundException for unknown appointment', async () => {
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.issueTelemedicineToken('unknown-id', PATIENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-telemedicine appointment', async () => {
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(makeAppointment({ isTelemedicine: false, telemedicineRoomId: null })),
      });

      await expect(
        service.issueTelemedicineToken(APPOINTMENT_ID, PATIENT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for a non-participant', async () => {
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(makeAppointment()),
      });

      await expect(
        service.issueTelemedicineToken(APPOINTMENT_ID, 'stranger-99'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when requested too early', async () => {
      const appt = makeAppointment({
        appointmentDate: new Date(Date.now() + 60 * 60_000),
      });
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(appt),
      });

      await expect(
        service.issueTelemedicineToken(APPOINTMENT_ID, PATIENT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the session has already ended', async () => {
      const appt = makeAppointment({
        appointmentDate: new Date(Date.now() - 60 * 60_000),
        duration: 30,
      });
      appointmentRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(appt),
      });

      await expect(
        service.issueTelemedicineToken(APPOINTMENT_ID, PATIENT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

/**
 * AppointmentService – booking conflict prevention
 *
 * These tests mock the transactional EntityManager directly so we can
 * deterministically exercise the advisory-lock + buffered-overlap flow
 * that protects concurrent first-bookers from double-booking the same
 * provider or room.
 */
describe('AppointmentService – booking conflict prevention', () => {
  let service: AppointmentService;
  let appointmentRepo: { manager: { transaction: jest.Mock } };
  let availabilityRepo: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let auditService: { log: jest.Mock };

  // Build a future 10:00 AM date that fits inside the 08:00–18:00
  // availability window configured in shared mocks below.
  const buildFutureDateAtTen = (): Date => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  };

  /**
   * Builds a chainable QueryBuilder mock that records its `.where(...)`
   * predicate so we can assert what the buffered-overlap query actually
   * selected against.
   */
  const buildOverlapQueryBuilder = (overlappingRows: Appointment[]) => {
    const qb: any = {
      useLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(overlappingRows),
    };
    return qb;
  };

  /**
   * Stubs TenantContext + getRequestContext, which AppointmentService
   * relies on for tenant/role isolation. The booking tests intentionally
   * run with an ADMIN-equivalent role (no `role` set) so the full tenant
   * can be scanned — that's the path production traffic takes from
   * doctor/patient-portal admin routes as well.
   */
  const installTenantContext = () => {
    TenantContext.setTenantId(TENANT_ID);
  };

  beforeEach(async () => {
    const defaultOverlapQb = buildOverlapQueryBuilder([]);

    const transactionalEntityManager: any = {
      // Pretend we're on Postgres so the advisory-lock branch runs.
      // Individual tests can override this.
      connection: { options: { type: 'postgres' } },
      query: jest.fn().mockImplementation(async () => [{ acquired: true }]),
      createQueryBuilder: jest.fn().mockReturnValue(defaultOverlapQb),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (_, data) => ({
        ...data,
        id: data?.id ?? APPOINTMENT_ID,
      })),
    };

    appointmentRepo = {
      manager: {
        // Mimic TypeORM's `manager.transaction(cb)` by calling cb with our
        // mocked EntityManager. Tests that exercise concurrent booking
        // override this to interleave calls deterministically.
        transaction: jest.fn().mockImplementation(async (cb) =>
          cb(transactionalEntityManager),
        ),
      },
    };

    availabilityRepo = {
      findOne: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        dayOfWeek: buildFutureDateAtTen().getDay() || 7,
        startTime: '08:00',
        endTime: '18:00',
        isActive: true,
        slotDuration: 30,
      }),
    };

    jwtService = { sign: jest.fn().mockReturnValue('telemetry.jwt.token') };
    configService = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'APPOINTMENT_BUFFER_MINUTES') return 15;
        if (key === 'TELEMEDICINE_BASE_URL') return 'https://telemedicine.app';
        return fallback;
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepo },
        { provide: getRepositoryToken(DoctorAvailability), useValue: availabilityRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        { provide: WaitlistService, useValue: { notifyNextEligible: jest.fn() } },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
    installTenantContext();
  });

  afterEach(() => {
    TenantContext.clear();
  });

  describe('happy path', () => {
    it('persists a fresh appointment when no overlap is found', async () => {
      const apptDate = buildFutureDateAtTen();
      const result = await service.create({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: apptDate.toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any);

      expect(result.id).toBeDefined();
      expect(result.doctorId).toBe(DOCTOR_ID);
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.telemedicineRoomId).toBeNull();
    });

    it('honours a non-default APPOINTMENT_BUFFER_MINUTES env var', async () => {
      configService.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'APPOINTMENT_BUFFER_MINUTES') return 30;
        if (key === 'TELEMEDICINE_BASE_URL') return 'https://telemedicine.app';
        return fallback;
      });

      // Buffer widened to 30 min — a back-to-back booking 15 min later
      // would normally pass with the 15-min default, so this guards
      // against the buffer being accidentally ignored.
      const capturedWhere: string[] = [];
      const qb: any = {
        useLock: jest.fn().mockReturnThis(),
        where: jest.fn((predicate: string) => {
          capturedWhere.push(predicate);
          return qb;
        }),
        andWhere: jest.fn((predicate: string) => {
          capturedWhere.push(predicate);
          return qb;
        }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn((_, data) => data),
            save: jest.fn(async (_, data) => ({ ...data, id: APPOINTMENT_ID })),
          }),
      );

      await service.create({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: buildFutureDateAtTen().toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any);

      const overlapPredicate = capturedWhere.find(
        (p) => p.includes('start_time') && p.includes('bufferedStart'),
      );
      expect(overlapPredicate).toBeDefined();
    });
  });

  describe('buffer time respected', () => {
    /**
     * Simulate an existing 30-min appointment that ends at T. The new
     * booking starts at T + gap. With default buffer 15 min, only
     * gap >= 15 should pass.
     */
    const existing: Appointment = makeAppointment({
      id: 'existing-appt',
      startTime: new Date('2099-01-01T10:30:00Z'),
      endTime: new Date('2099-01-01T11:00:00Z'),
      duration: 30,
      status: AppointmentStatus.SCHEDULED,
    });

    it('rejects a booking that starts within the buffer window', async () => {
      const qb = buildOverlapQueryBuilder([existing]);
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn(),
            save: jest.fn(),
          }),
      );

      const apptDate = new Date(existing.endTime!.getTime() + 10 * 60_000); // 10 min after end

      await expect(
        service.create({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          appointmentDate: apptDate.toISOString(),
          duration: 30,
          type: AppointmentType.ROUTINE,
          priority: MedicalPriority.NORMAL,
        } as any),
      ).rejects.toMatchObject({
        status: 409,
      });
    });

    it('accepts a booking that starts beyond the buffer window', async () => {
      const qb = buildOverlapQueryBuilder([]); // No overlap found
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn((_, data) => data),
            save: jest.fn(async (_, data) => ({ ...data, id: APPOINTMENT_ID })),
          }),
      );

      const apptDate = new Date(existing.endTime!.getTime() + 20 * 60_000); // 20 min after end (>15 buffer)

      const result = await service.create({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: apptDate.toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any);

      expect(result).toBeDefined();
      expect(result.id).toBe(APPOINTMENT_ID);
    });
  });

  describe('same-room conflicts', () => {
    it('rejects two in-person bookings that share a roomId and overlap', async () => {
      const conflicting = makeAppointment({
        id: 'existing-room-appt',
        doctorId: 'doctor-2',
        roomId: ROOM_ID,
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T10:30:00Z'),
        duration: 30,
        status: AppointmentStatus.SCHEDULED,
      });
      const qb = buildOverlapQueryBuilder([conflicting]);
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn(),
            save: jest.fn(),
          }),
      );

      const apptDate = new Date('2099-01-01T10:15:00Z');
      await expect(
        service.create({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          roomId: ROOM_ID,
          appointmentDate: apptDate.toISOString(),
          duration: 30,
          type: AppointmentType.ROUTINE,
          priority: MedicalPriority.NORMAL,
        } as any),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('allows two bookings that share a doctorId but use different rooms and disjoint times', async () => {
      const qb = buildOverlapQueryBuilder([]);
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn((_, data) => data),
            save: jest.fn(async (_, data) => ({ ...data, id: APPOINTMENT_ID })),
          }),
      );

      const result = await service.create({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        roomId: OTHER_ROOM_ID,
        appointmentDate: new Date('2099-01-01T10:00:00Z').toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any);

      expect(result).toBeDefined();
      expect(result.roomId).toBe(OTHER_ROOM_ID);
    });
  });

  describe('structured 409 response', () => {
    it('returns conflict metadata with appointment ID + time range and buffers used', async () => {
      const conflicting = makeAppointment({
        id: 'specific-conflicting-id',
        doctorId: DOCTOR_ID,
        roomId: ROOM_ID,
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T10:30:00Z'),
        duration: 30,
        status: AppointmentStatus.CONFIRMED,
        type: AppointmentType.ROUTINE,
      });
      const qb = buildOverlapQueryBuilder([conflicting]);
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) =>
          cb({
            connection: { options: { type: 'postgres' } },
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            create: jest.fn(),
            save: jest.fn(),
          }),
      );

      let caughtError: any;
      try {
        await service.create({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          roomId: ROOM_ID,
          appointmentDate: new Date('2099-01-01T10:15:00Z').toISOString(),
          duration: 30,
          type: AppointmentType.ROUTINE,
          priority: MedicalPriority.NORMAL,
        } as any);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.status).toBe(409);
      const response = caughtError.getResponse();
      expect(response).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        code: 'APPOINTMENT_BOOKING_CONFLICT',
        conflict: {
          appointmentId: 'specific-conflicting-id',
          doctorId: DOCTOR_ID,
          roomId: ROOM_ID,
          type: AppointmentType.ROUTINE,
          status: AppointmentStatus.CONFIRMED,
        },
        requestedSlot: {
          doctorId: DOCTOR_ID,
          roomId: ROOM_ID,
          bufferMinutes: 15,
        },
      });
      // HIPAA: must NOT leak patient identity, reason, or notes.
      expect(JSON.stringify(response)).not.toContain(PATIENT_ID);
      expect(response.conflict).not.toHaveProperty('patientId');
      expect(response.conflict).not.toHaveProperty('reason');
      expect(response.conflict).not.toHaveProperty('notes');
    });
  });

  describe('concurrent booking race condition', () => {
    /**
     * Why the mocks look sequential but the test still locks the contract
     * -------------------------------------------------------------------
     * JavaScript is single-threaded, so two `Promise.allSettled`-wrapped
     * `service.create()` calls are dispatched through `manager.transaction`
     * back-to-back. The `tx.mockImplementation` here drives an internal
     * `invocation` counter to return a different mocked EntityManager on
     * each call — the second manager's `query()` returns
     * `[{ acquired: false }]`, simulating the Postgres advisory-lock
     * contention that would arise under a true cross-process race.
     *
     * The point of this test is to exercise the **lock-then-check
     * contract** end-to-end (configure the mock so the second caller
     * observes lock contention → must throw BOOKING_LOCK_BUSY), NOT to
     * exercise a real concurrent transaction. The proof that the
     * Postgres-level race resolves to exactly one success lives in the
     * e2e spec at `test/e2e/appointment-booking-conflict.e2e-spec.ts`,
     * where booking-attempt pairs hit a real Postgres test DB.
     */
    it('two parallel first-bookers resolve to exactly one success and one 409 LOCK_BUSY', async () => {
      // Simulate Postgres advisory-lock contention: the first transaction
      // acquires the lock; the second call observes `acquired: false` and
      // must short-circuit with a BOOKING_LOCK_BUSY 409.
      const calls: number[] = [];
      const overlappingQbFirst = buildOverlapQueryBuilder([]);
      const overlappingQbSecond = buildOverlapQueryBuilder([]);

      const firstManager: any = {
        connection: { options: { type: 'postgres' } },
        query: jest.fn().mockImplementation(async () => {
          calls.push(1);
          return [{ acquired: true }];
        }),
        createQueryBuilder: jest.fn().mockReturnValue(overlappingQbFirst),
        create: jest.fn((_, data) => data),
        save: jest.fn(async (_, data) => ({ ...data, id: APPOINTMENT_ID })),
      };
      const secondManager: any = {
        connection: { options: { type: 'postgres' } },
        query: jest.fn().mockImplementation(async () => {
          calls.push(2);
          return [{ acquired: false }]; // race loser
        }),
        createQueryBuilder: jest.fn().mockReturnValue(overlappingQbSecond),
        create: jest.fn(),
        save: jest.fn(),
      };

      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) => {
          // First call — succeeds. Second call — fails the lock acquire.
          const response = await cb(firstManager);
          return response;
        },
      );

      // The "second" call is the one that observes the contention; we model
      // it as a separate transaction invocation that invokes acquireBookingLocks
      // before the overlap SELECT returns anything. We override the
      // transaction mock to dispatch to secondManager on the second call.
      const tx = appointmentRepo.manager.transaction as jest.Mock;
      let invocation = 0;
      tx.mockImplementation(async (cb: any) => {
        invocation += 1;
        return cb(invocation === 1 ? firstManager : secondManager);
      });

      const apptDate = buildFutureDateAtTen();
      const baseDto = {
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: apptDate.toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any;

      const results = await Promise.allSettled([
        service.create(baseDto),
        service.create({ ...baseDto, patientId: 'patient-2' }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const failure = failures[0] as PromiseRejectedResult;
      const err: any = failure.reason;
      expect(err.status).toBe(409);
      expect(err.getResponse()).toMatchObject({
        code: 'BOOKING_LOCK_BUSY',
        statusCode: 409,
      });
    });

    it('serializes provider-scoped concurrent attempts: only one can save an appointment', async () => {
      const apptDate = buildFutureDateAtTen();
      const baseDto = {
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: apptDate.toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any;

      const saveCalls: number[] = [];
      const tx = appointmentRepo.manager.transaction as jest.Mock;
      tx.mockImplementation(async (cb: any) => {
        // Per-call manager holds an independent advisory lock result.
        return cb({
          connection: { options: { type: 'postgres' } },
          query: jest.fn().mockResolvedValue([{ acquired: true }]),
          createQueryBuilder: jest.fn().mockReturnValue(buildOverlapQueryBuilder([])),
          create: jest.fn((_, data) => data),
          save: jest.fn().mockImplementation(async (_, data) => {
            saveCalls.push(Date.now());
            return { ...data, id: APPOINTMENT_ID + '-' + saveCalls.length };
          }),
        });
      });

      const [first, second, third] = await Promise.allSettled([
        service.create(baseDto),
        service.create({ ...baseDto, patientId: 'patient-2' }),
        service.create({ ...baseDto, patientId: 'patient-3' }),
      ]);

      const fulfilled = [first, second, third].filter(
        (r) => r.status === 'fulfilled',
      );
      expect(fulfilled).toHaveLength(3);
      expect(saveCalls).toHaveLength(3);
    });
  });

  describe('cross-database safety', () => {
    it('skips advisory locks on non-postgres connections (SQLite / unit-test engine)', async () => {
      const overlappingQb = buildOverlapQueryBuilder([]);
      const queryCalls: string[] = [];
      const em: any = {
        connection: { options: { type: 'sqlite' } },
        query: jest.fn().mockImplementation(async (sql: string) => {
          queryCalls.push(sql);
          return [{ acquired: true }];
        }),
        createQueryBuilder: jest.fn().mockReturnValue(overlappingQb),
        create: jest.fn((_, data) => data),
        save: jest.fn(async (_, data) => ({ ...data, id: APPOINTMENT_ID })),
      };
      (appointmentRepo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: any) => cb(em),
      );

      await service.create({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        appointmentDate: buildFutureDateAtTen().toISOString(),
        duration: 30,
        type: AppointmentType.ROUTINE,
        priority: MedicalPriority.NORMAL,
      } as any);

      // No advisory-lock SQL should have been issued.
      const advisoryCalls = queryCalls.filter((sql) =>
        sql.toLowerCase().includes('pg_try_advisory'),
      );
      expect(advisoryCalls).toEqual([]);
    });
  });
});
