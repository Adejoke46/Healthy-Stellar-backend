import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  Not,
  FindOptionsWhere,
  EntityManager,
} from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Appointment, AppointmentStatus, MedicalPriority } from '../entities/appointment.entity';
import { DoctorAvailability } from '../entities/doctor-availability.entity';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { AuditService } from '../../common/audit/audit.service';
import { TenantContext } from '../../tenant/context/tenant.context';
import { getRequestContext } from '../../common/middleware/request-context.middleware';
import { UserRole } from '../../auth/entities/user.entity';
import { WaitlistService } from './waitlist.service';

/** How many minutes before the appointment start a join token becomes valid. */
const TOKEN_VALID_BEFORE_MINUTES = 15;

/**
 * Default cleanup gap (in minutes) inserted between any two bookings that
 * share a provider or a physical room.
 *
 * Overridable at deploy time via the env var
 * `APPOINTMENT_BUFFER_MINUTES` so a tenant can tighten (or relax) the
 * cleanup policy without a code change. Read fresh inside the booking
 * transaction so a config reload takes effect on the very next request.
 */
const DEFAULT_APPOINTMENT_BUFFER_MINUTES = 15;

/** Lock-namespace prefix for transactional advisory locks. */
const ADVISORY_LOCK_NAMESPACE = 'appt';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(DoctorAvailability)
    private availabilityRepository: Repository<DoctorAvailability>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => WaitlistService))
    private readonly waitlistService: WaitlistService,
  ) {}

  /**
   * Generates a TypeORM where object that enforces tenant and user-level isolation.
   * @private
   */
  private getScopedWhere(baseWhere: FindOptionsWhere<Appointment> = {}): FindOptionsWhere<Appointment> {
    const tenantId = TenantContext.getTenantId();
    const context = getRequestContext();

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const scopedWhere: FindOptionsWhere<Appointment> = {
      ...baseWhere,
      tenantId,
    };

    if (context?.role === UserRole.PATIENT) {
      scopedWhere.patientId = context.userId;
    } else if (context?.role === UserRole.PHYSICIAN) {
      scopedWhere.doctorId = context.userId;
    }
    // Admins and other staff can see all within tenant by default

    return scopedWhere;
  }

  async create(
    createAppointmentDto: CreateAppointmentDto,
    transactionManager?: EntityManager,
  ): Promise<Appointment> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const appointmentDate = new Date(createAppointmentDto.appointmentDate);
    const duration = createAppointmentDto.duration;
    const startTime = new Date(appointmentDate);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    // Buffer is read on every booking so an SRE-side config reload takes
    // effect immediately, without an app restart.
    const bufferMinutes = Math.max(
      0,
      this.configService.get<number>(
        'APPOINTMENT_BUFFER_MINUTES',
        DEFAULT_APPOINTMENT_BUFFER_MINUTES,
      ),
    );
    const bufferMs = bufferMinutes * 60_000;
    const bufferedStart = new Date(startTime.getTime() - bufferMs);
    const bufferedEnd = new Date(endTime.getTime() + bufferMs);

    const providerLockKey = `${ADVISORY_LOCK_NAMESPACE}:provider:${createAppointmentDto.doctorId}`;
    const roomLockKey = createAppointmentDto.roomId
      ? `${ADVISORY_LOCK_NAMESPACE}:room:${createAppointmentDto.roomId}`
      : null;

    // Pessimistic + advisory locking to prevent concurrent double-booking.
    //
    // Why both?
    //   - SELECT ... FOR UPDATE only locks rows the query *finds*. Two
    //     concurrent first-bookers for an empty slot would each see zero
    //     overlapping rows and therefore acquire zero row-level locks.
    //   - pg_advisory_xact_lock serialises every transaction acquiring
    //     the same lock key, so exactly one of the concurrent first-
    //     bookers can enter the critical section at a time. On
    //     non-Postgres connections (in-memory unit tests) we skip the
    //     advisory lock and rely on:
    //       (a) SQLite's whole-file write lock for transactional
    //           correctness in test modes that go through a real
    //           SqliteDataSource, AND
    //       (b) the unit-test mock layer, which simulates the
    //           "lock-then-check" pattern by short-circuiting on the
    //           second caller's `query()`.
    //   - The pessimistic_write on the overlap SELECT is kept as defence
    //     in depth so that, on engines without advisory locks, AFTER the
    //     transaction starts we still serialise updates of any existing
    //     matching rows.
    const createWithinTransaction = async (
      transactionalEntityManager: EntityManager,
    ): Promise<Appointment> => {
        await this.acquireBookingLocks(
          transactionalEntityManager,
          providerLockKey,
          roomLockKey,
        );

        // SELECT ... FOR UPDATE — lock any overlapping appointments for
        // (a) the same provider OR (b) the same physical room.
        const overlapping = await transactionalEntityManager
          .createQueryBuilder(Appointment, 'appt')
          .useLock('pessimistic_write')
          .where('appt.status NOT IN (:...cancelledStatuses)', {
            cancelledStatuses: [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED],
          })
          .andWhere(
            'appt.start_time < :bufferedEnd AND appt.end_time > :bufferedStart',
            { bufferedStart, bufferedEnd },
          )
          .andWhere(
            '(appt.doctor_id = :doctorId OR (appt.room_id IS NOT NULL AND appt.room_id = :roomId))',
            {
              doctorId: createAppointmentDto.doctorId,
              roomId: createAppointmentDto.roomId ?? null,
            },
          )
          .getMany();

        if (overlapping.length > 0) {
          throw new ConflictException(
            this.buildBookingConflictResponse(
              overlapping,
              {
                doctorId: createAppointmentDto.doctorId,
                roomId: createAppointmentDto.roomId ?? null,
                startTime,
                endTime,
              },
              bufferMinutes,
            ),
          );
        }

        // Check doctor availability (within availability schedule).
        // We still call this for non-overlapping appointments so that
        // out-of-hours slots are rejected with a 400 rather than silently
        // going through.
        const isAvailable = await this.checkDoctorAvailability(
          createAppointmentDto.doctorId,
          appointmentDate,
          duration,
        );

        if (!isAvailable) {
          throw new BadRequestException('Doctor is not available at the requested time');
        }

        // Check specialty match if specified.
        if (createAppointmentDto.specialty) {
          const hasSpecialty = await this.checkDoctorSpecialty(
            createAppointmentDto.doctorId,
            createAppointmentDto.specialty,
          );
          if (!hasSpecialty) {
            throw new BadRequestException('Doctor does not have the required specialty');
          }
        }

        const telemedicineRoomId = createAppointmentDto.isTelemedicine ? randomUUID() : null;

        const appointment = transactionalEntityManager.create(Appointment, {
          ...createAppointmentDto,
          // Honour whatever roomId the caller passed for an in-person
          // appointment; null for telemedicine so room-overlap checks
          // intentionally ignore it on subsequent bookings.
          roomId: createAppointmentDto.roomId ?? null,
          tenantId,
          appointmentDate,
          startTime,
          endTime,
          telemedicineRoomId,
          telemedicineLink: telemedicineRoomId
            ? `${this.configService.get<string>('TELEMEDICINE_BASE_URL', 'https://telemedicine.app')}/room/${telemedicineRoomId}`
            : null,
        });

        const saved = await transactionalEntityManager.save(Appointment, appointment);

        // Audit log: APPOINTMENT_CREATED (non-blocking).
        await this.auditService
          .log({
            actorId: createAppointmentDto.patientId,
            action: 'APPOINTMENT_CREATED',
            resourceId: saved.id,
            resourceType: 'Appointment',
            tenantId,
            timestamp: new Date(),
          })
          .catch((err) => {
            console.error('Failed to log appointment creation audit event:', err.message);
          });

        return saved;
      };

    return transactionManager
      ? createWithinTransaction(transactionManager)
      : this.appointmentRepository.manager.transaction(createWithinTransaction);
  }

  /**
   * Acquires the per-provider and per-room Postgres advisory locks used
   * to serialise concurrent bookings. Falls back silently on non-Postgres
   * connections (e.g., SQLite-backed test double), where the unit-test
   * mock layer is responsible for simulating the
   * "try_advisory_lock then check" pattern.
   *
   * On Postgres we use `pg_try_advisory_xact_lock` rather than
   * `pg_advisory_xact_lock` so a second concurrent caller does not block
   * waiting on the first — it instead fails fast with a 409 telling the
   * caller to retry, which is the documented behaviour for the
   * "exactly one success" acceptance criterion.
   */
  private async acquireBookingLocks(
    transactionalEntityManager: EntityManager,
    providerLockKey: string,
    roomLockKey: string | null,
  ): Promise<void> {
    const dbType = (transactionalEntityManager.connection.options as { type?: string }).type;
    if (dbType !== 'postgres') {
      // Other engines are not yet wired with the same cross-process
      // serialisation; the unit suite mocks the lock layer to exercise
      // this branch, and SQLite (when used end-to-end) relies on its
      // database-level write lock.
      return;
    }

    const lockResults = await Promise.all([
      transactionalEntityManager.query(
        `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
        [providerLockKey],
      ),
      roomLockKey
        ? transactionalEntityManager.query(
            `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
            [roomLockKey],
          )
        : Promise.resolve([{ acquired: true }]),
    ]);

    const failed = lockResults.some((rows) => {
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return !row || row.acquired !== true;
    });
    if (failed) {
      throw new ConflictException({
        message:
          'Another booking is currently being processed for this provider ' +
          'or room. Please retry in a moment.',
        code: 'BOOKING_LOCK_BUSY',
        requestedSlot: {
          providerLockKey,
          roomLockKey,
        },
      });
    }
  }

  /**
   * Builds a structured 409 Conflict response describing which existing
   * appointment(s) collided and what slot the caller requested. The
   * response intentionally omits the conflicting appointment's
   * `patientId`, `reason` and `notes` fields to avoid leaking PHI to a
   * requester who is not necessarily authorised to see them.
   */
  private buildBookingConflictResponse(
    overlapping: Appointment[],
    requestedSlot: {
      doctorId: string;
      roomId: string | null;
      startTime: Date;
      endTime: Date;
    },
    bufferMinutes: number,
  ): {
    statusCode: number;
    error: string;
    message: string;
    code: string;
    conflict: {
      appointmentId: string;
      doctorId: string;
      roomId: string | null;
      startTime: string;
      endTime: string;
      type: string;
      status: string;
    };
    requestedSlot: {
      doctorId: string;
      roomId: string | null;
      startTime: string;
      endTime: string;
      bufferMinutes: number;
    };
  } {
    const first = overlapping[0];
    return {
      statusCode: 409,
      error: 'Conflict',
      message: 'Time slot conflicts with an existing appointment.',
      code: 'APPOINTMENT_BOOKING_CONFLICT',
      conflict: {
        appointmentId: first.id,
        doctorId: first.doctorId,
        roomId: first.roomId ?? null,
        startTime: first.startTime?.toISOString() ?? null,
        endTime: first.endTime?.toISOString() ?? null,
        type: first.type,
        status: first.status,
      },
      requestedSlot: {
        doctorId: requestedSlot.doctorId,
        roomId: requestedSlot.roomId,
        startTime: requestedSlot.startTime.toISOString(),
        endTime: requestedSlot.endTime.toISOString(),
        bufferMinutes,
      },
    };
  }

  async findAll(): Promise<Appointment[]> {
    return this.appointmentRepository.find({
      where: this.getScopedWhere(),
      relations: ['consultationNotes'],
      order: { appointmentDate: 'ASC' },
    });
  }

  async findByPriority(priority: MedicalPriority): Promise<Appointment[]> {
    return this.appointmentRepository.find({
      where: this.getScopedWhere({ priority }),
      relations: ['consultationNotes'],
      order: { appointmentDate: 'ASC' },
    });
  }

  async findByDoctor(doctorId: string, date?: Date): Promise<Appointment[]> {
    const whereCondition: FindOptionsWhere<Appointment> = { doctorId };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      whereCondition.appointmentDate = Between(startOfDay, endOfDay);
    }

    return this.appointmentRepository.find({
      where: this.getScopedWhere(whereCondition),
      relations: ['consultationNotes'],
      order: { appointmentDate: 'ASC' },
    });
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({ 
      where: this.getScopedWhere({ id }) 
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = status;
    const updated = await this.appointmentRepository.save(appointment);

    // Audit log appropriate action based on status change
    const auditAction =
      status === AppointmentStatus.CANCELLED
        ? 'APPOINTMENT_CANCELLED'
        : 'APPOINTMENT_UPDATED';

    await this.auditService.log({
      actorId: appointment.patientId,
      action: auditAction,
      resourceId: id,
      resourceType: 'Appointment',
      tenantId: appointment.tenantId,
      timestamp: new Date(),
    }).catch((err) => {
      console.error(`Failed to log appointment status change audit event: ${err.message}`);
    });

    if (status === AppointmentStatus.CANCELLED) {
      this.waitlistService.notifyNextEligible(updated).catch((err) => {
        this.logger.error(`Waitlist notification failed for appointment ${id}: ${err.message}`);
      });
    }

    return updated;
  }

  async getAvailableSlots(doctorId: string, date: Date): Promise<string[]> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const dayOfWeek = date.getDay() || 7; // Convert Sunday (0) to 7

    const availability = await this.availabilityRepository.findOne({
      where: {
        doctorId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (!availability) {
      return [];
    }

    // Get existing appointments for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await this.appointmentRepository.find({
      where: this.getScopedWhere({
        doctorId,
        appointmentDate: Between(startOfDay, endOfDay),
        status: Not(AppointmentStatus.CANCELLED),
      }),
    });

    return this.calculateAvailableSlots(availability, existingAppointments, date);
  }

  async getProviderAvailability(providerId: string, date: Date): Promise<{
    available: boolean;
    slots: string[];
    conflicts: number;
    date: string;
  }> {
    const slots = await this.getAvailableSlots(providerId, date);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingCount = await this.appointmentRepository.count({
      where: this.getScopedWhere({
        doctorId: providerId,
        appointmentDate: Between(startOfDay, endOfDay),
        status: Not(AppointmentStatus.CANCELLED),
      }),
    });

    return {
      available: slots.length > 0,
      slots,
      conflicts: existingCount,
      date: date.toISOString(),
    };
  }

  private async checkDoctorAvailability(
    doctorId: string,
    appointmentDate: Date,
    duration: number,
  ): Promise<boolean> {
    const tenantId = TenantContext.getTenantId();
    const dayOfWeek = appointmentDate.getDay() || 7;

    const availability = await this.availabilityRepository.findOne({
      where: {
        doctorId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (!availability) return false;

    // Check if appointment time falls within availability hours
    const appointmentTime = appointmentDate.getHours() * 60 + appointmentDate.getMinutes();
    const [startHour, startMin] = availability.startTime.split(':').map(Number);
    const [endHour, endMin] = availability.endTime.split(':').map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (appointmentTime < startTime || appointmentTime + duration > endTime) {
      return false;
    }

    // Check for conflicts with existing appointments
    const startOfSlot = new Date(appointmentDate);
    const endOfSlot = new Date(appointmentDate.getTime() + duration * 60000);

    const conflictingAppointments = await this.appointmentRepository.count({
      where: this.getScopedWhere({
        doctorId,
        appointmentDate: Between(startOfSlot, endOfSlot),
        status: Not(AppointmentStatus.CANCELLED),
      }),
    });

    return conflictingAppointments === 0;
  }

  private async checkDoctorSpecialty(doctorId: string, specialty: string): Promise<boolean> {
    const availability = await this.availabilityRepository.findOne({
      where: { doctorId, isActive: true },
    });

    return availability?.specialties?.includes(specialty) || false;
  }

  private calculateAvailableSlots(
    availability: DoctorAvailability,
    existingAppointments: Appointment[],
    date: Date,
  ): string[] {
    const slots: string[] = [];
    const [startHour, startMin] = availability.startTime.split(':').map(Number);
    const [endHour, endMin] = availability.endTime.split(':').map(Number);

    let currentTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    while (currentTime + availability.slotDuration <= endTime) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + availability.slotDuration * 60000);

      const hasConflict = existingAppointments.some((apt) => {
        const aptStart = new Date(apt.appointmentDate);
        const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
        return slotStart < aptEnd && slotEnd > aptStart;
      });

      if (!hasConflict) {
        slots.push(
          `${String(Math.floor(currentTime / 60)).padStart(2, '0')}:${String(currentTime % 60).padStart(2, '0')}`,
        );
      }

      currentTime += availability.slotDuration;
    }

    return slots;
  }

  /**
   * Issues a signed, time-limited JWT that authorises `participantId` to join
   * the telemedicine room for appointment `id`.
   *
   * The token is valid only within the window
   *   [appointmentDate - TOKEN_VALID_BEFORE_MINUTES, appointmentDate + duration]
   * so it cannot be used to join early or after the session ends.
   */
  async issueTelemedicineToken(
    id: string,
    participantId: string,
  ): Promise<{ token: string; roomUrl: string }> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    // Load the sensitive columns that are excluded from normal selects
    const appointment = await this.appointmentRepository
      .createQueryBuilder('a')
      .addSelect('a.telemedicine_room_id', 'a_telemedicineRoomId')
      .addSelect('a.telemedicine_link', 'a_telemedicineLink')
      .where('a.id = :id', { id })
      .andWhere('a.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
    if (!appointment.isTelemedicine || !appointment.telemedicineRoomId) {
      throw new BadRequestException('Appointment is not a telemedicine session');
    }

    // Only the patient or the doctor may obtain a token
    if (participantId !== appointment.patientId && participantId !== appointment.doctorId) {
      throw new ForbiddenException('Not a participant of this appointment');
    }

    const now = Date.now();
    const windowStart = appointment.appointmentDate.getTime() - TOKEN_VALID_BEFORE_MINUTES * 60_000;
    const windowEnd = appointment.appointmentDate.getTime() + appointment.duration * 60_000;

    if (now < windowStart) {
      throw new BadRequestException(
        `Token not yet available – join window opens ${TOKEN_VALID_BEFORE_MINUTES} minutes before the appointment`,
      );
    }
    if (now > windowEnd) {
      throw new BadRequestException('Appointment session has already ended');
    }

    const expiresInSeconds = Math.floor((windowEnd - now) / 1000);

    const token = this.jwtService.sign(
      {
        sub: participantId,
        appointmentId: id,
        roomId: appointment.telemedicineRoomId,
        role: participantId === appointment.doctorId ? 'doctor' : 'patient',
      },
      { expiresIn: expiresInSeconds },
    );

    return {
      token,
      roomUrl: `${appointment.telemedicineLink}?token=${token}`,
    };
  }
}
