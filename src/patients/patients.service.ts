import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, DataSource } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { AdminMergePatientsDto } from './dto/admin-merge-patients.dto';
import { generateMRN } from './utils/mrn.generator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  NotificationChannel,
  UpdateNotificationPreferencesDto,
} from './dto/update-notification-preferences.dto';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types/notification-preferences.type';
import { UserRole } from '../auth/entities/user.entity';
import { AuditLogEntity } from '../common/audit/audit-log.entity';
import { RedisLockService } from '../common/utils/redis-lock.service';
import { StellarService } from '../stellar/services/stellar.service';
import { TenantFieldValidationService } from '../data-validation-integrity/services/tenant-field-validation.service';
import { TenantContext } from '../tenant/context/tenant.context';

interface DuplicateCandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex?: string;
  mrn?: string;
  score: number;
  reason: 'exact' | 'fuzzy';
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    private readonly dataSource: DataSource,
    private readonly redisLock: RedisLockService,
    private readonly stellarService: StellarService,
    private readonly tenantFieldValidationService: TenantFieldValidationService,
  ) {}

  async create(dto: CreatePatientDto, registeredBy?: string): Promise<Patient> {
    if (dto?.dateOfBirth && Number.isNaN(new Date(dto.dateOfBirth as any).getTime())) {
      throw new BadRequestException('Invalid date of birth');
    }

    const tenantId = TenantContext.getTenantId();
    if (tenantId) {
      await this.tenantFieldValidationService.validateFields(tenantId, dto.customFields ?? {});
    }

    if ((dto as any)?.mrn) {
      const existingByMrn = await this.patientRepo.findOneBy({ mrn: (dto as any).mrn });
      if (existingByMrn) {
        throw new ConflictException('Patient with MRN already exists');
      }
    }

    const duplicateCandidates = await this.detectDuplicate(dto);
    if (duplicateCandidates.length > 0) {
      throw new ConflictException({
        message: 'Possible duplicate patient detected',
        candidates: duplicateCandidates,
      });
    }

    const patient = this.patientRepo.create({
      ...dto,
      mrn: generateMRN(),
      isAdmitted: false,
      isActive: true,
      registeredBy: registeredBy ?? null,
    } as any as Patient);

    return this.patientRepo.save(patient);
  }

  async findById(id: string): Promise<Patient> {
    let patient: Patient | null = null;
    try {
      patient = await this.patientRepo.findOne({ where: { id } });
    } catch {
      patient = null;
    }
    if (!patient) {
      try {
        patient = await this.patientRepo.findOne({ where: { stellarAddress: id } });
      } catch {
        patient = null;
      }
    }
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async findByMRN(mrn: string): Promise<Patient | null> {
    return this.patientRepo.findOneBy({ mrn });
  }

  async findAll(
    paginationDto?: PaginationDto,
    filters?: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<Patient>> {
    if (!paginationDto) {
      // Backward compatibility: return all patients if no pagination provided
      const patients =
        filters && Object.keys(filters).length > 0
          ? await this.patientRepo.find({ where: filters as any })
          : await this.patientRepo.find();
      return PaginationUtil.createResponse(patients, patients.length, 1, patients.length);
    }

    return PaginationUtil.paginate(
      this.patientRepo,
      paginationDto,
      filters && Object.keys(filters).length > 0 ? { where: filters as any } : undefined,
    );
  }

  async search(search: string): Promise<Patient[]> {
    if (!search || search.trim() === '') {
      return this.patientRepo.find({ take: 20 });
    }

    return this.patientRepo.find({
      where: [
        { mrn: Like(`%${search}%`) as any },
        { firstName: Like(`%${search}%`) as any },
        { lastName: Like(`%${search}%`) as any },
        { nationalId: Like(`%${search}%`) as any },
      ] as any,
      take: 20,
    });
  }

  async admit(id: string): Promise<Patient> {
    const patient = await this.findById(id);
    patient.isAdmitted = true;
    patient.admissionDate = new Date().toISOString().split('T')[0];
    return this.patientRepo.save(patient);
  }

  async discharge(id: string): Promise<Patient> {
    const patient = await this.findById(id);
    patient.isAdmitted = false;
    patient.dischargeDate = new Date().toISOString().split('T')[0];
    return this.patientRepo.save(patient);
  }

  private async detectDuplicate(dto: CreatePatientDto): Promise<DuplicateCandidateSummary[]> {
    const exactMatch = await this.patientRepo.findOne({
      where: [
        { nationalId: dto.nationalId },
        { email: dto.email },
        { phone: dto.phone },
        { firstName: dto.firstName, lastName: dto.lastName, dateOfBirth: dto.dateOfBirth },
      ],
    });

    if (exactMatch) {
      return [
        {
          id: exactMatch.id,
          firstName: exactMatch.firstName,
          lastName: exactMatch.lastName,
          dateOfBirth: exactMatch.dateOfBirth,
          sex: exactMatch.sex,
          mrn: exactMatch.mrn,
          score: 1,
          reason: 'exact',
        },
      ];
    }

    if (!dto.firstName || !dto.lastName || !dto.dateOfBirth) {
      return [];
    }

    const fullName = `${dto.firstName} ${dto.lastName}`.trim();
    const normalizedGender = (dto.sex ?? dto.genderIdentity ?? 'unknown').toString().toLowerCase();

    const fuzzyMatches = await this.patientRepo.query(
      `
        SELECT
          id,
          "firstName",
          "lastName",
          "dateOfBirth",
          "sex",
          mrn,
          GREATEST(
            similarity(lower(coalesce("firstName", '') || ' ' || coalesce("lastName", '')), $1),
            similarity(lower(coalesce("firstName", '')), $2),
            similarity(lower(coalesce("lastName", '')), $3)
          )::float AS score
        FROM patients
        WHERE "isActive" = true
          AND "dateOfBirth" = $4
          AND lower(coalesce("sex", 'unknown')) = $5
          AND (
            similarity(lower(coalesce("firstName", '') || ' ' || coalesce("lastName", '')), $1) > 0.85
            OR similarity(lower(coalesce("firstName", '')), $2) > 0.85
            OR similarity(lower(coalesce("lastName", '')), $3) > 0.85
          )
        ORDER BY score DESC
        LIMIT 10
      `,
      [
        fullName.toLowerCase(),
        dto.firstName.toLowerCase(),
        dto.lastName.toLowerCase(),
        dto.dateOfBirth,
        normalizedGender,
      ],
    );

    const normalizedCandidates = Array.isArray(fuzzyMatches) ? fuzzyMatches : [];

    return normalizedCandidates
      .filter((candidate: any) => Number(candidate.score ?? 0) > 0.85)
      .map((candidate: any) => ({
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        dateOfBirth: candidate.dateOfBirth,
        sex: candidate.sex,
        mrn: candidate.mrn,
        score: Number(candidate.score ?? 0),
        reason: 'fuzzy',
      }));
  }

  async update(id: string, updateData: Partial<Patient>): Promise<Patient> {
    await this.patientRepo.update(id, updateData as any);
    const updated = await this.patientRepo.findOneBy({ id });
    if (!updated) throw new NotFoundException('Patient not found');
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.patientRepo.update(id, { isActive: false } as any);
  }

  async updateProfile(
    stellarAddress: string,
    profileData: Partial<
      Pick<
        Patient,
        | 'phone'
        | 'email'
        | 'address'
        | 'contactPreferences'
        | 'emergencyContact'
        | 'primaryLanguage'
        | 'genderIdentity'
      >
    >,
  ): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { stellarAddress } });
    if (!patient) throw new NotFoundException('Patient not found');
    Object.assign(patient, profileData);
    return this.patientRepo.save(patient);
  }

  async setGeoRestrictions(id: string, allowedCountries: string[]): Promise<Patient> {
    const patient = await this.findById(id);
    patient.allowedCountries =
      allowedCountries.length > 0 ? allowedCountries.map((c) => c.toUpperCase()) : null;
    return this.patientRepo.save(patient);
  }

  async attachPhoto(patientId: string, file: Express.Multer.File): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');
    patient.patientPhotoUrl = `/uploads/patients/photos/${file.filename}`;
    return this.patientRepo.save(patient);
  }

  async updateNotificationPreferences(
    patientId: string,
    requesterId: string,
    requesterRole: UserRole,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<{ notificationPreferences: Patient['notificationPreferences'] }> {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });

    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} not found`);
    }

    if (requesterRole !== UserRole.PATIENT || requesterId !== patientId) {
      throw new ForbiddenException('You can only update your own notification preferences');
    }

    if (dto.channels?.includes(NotificationChannel.SMS) && !patient.isPhoneVerified) {
      throw new BadRequestException(
        'SMS channel requires a verified phone number. Please verify your phone first.',
      );
    }

    const currentPreferences = patient.notificationPreferences ?? {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };

    patient.notificationPreferences = {
      ...currentPreferences,
      ...dto,
    };

    const savedPatient = await this.patientRepo.save(patient);

    return {
      notificationPreferences: savedPatient.notificationPreferences,
    };
  }

  async mergePatients(
    sourceId: string,
    targetId: string,
    adminId: string,
    reason?: string,
  ): Promise<Patient> {
    const lockKeys = [sourceId, targetId].sort().map((id) => `merge:${id}`);
    const LOCK_TTL_MS = 30_000;

    const acquired = await Promise.all(
      lockKeys.map((k) => this.redisLock.acquireLock(k, LOCK_TTL_MS)),
    );
    if (acquired.some((ok) => !ok)) {
      await Promise.all(lockKeys.map((k) => this.redisLock.releaseLock(k)));
      throw new ConflictException(
        'A concurrent merge is already in progress for one of these patients',
      );
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction('SERIALIZABLE');

    try {
      const [target, source] = await Promise.all([
        qr.manager.findOne(Patient, {
          where: { id: targetId },
          lock: { mode: 'optimistic', version: undefined },
        }),
        qr.manager.findOne(Patient, {
          where: { id: sourceId },
          lock: { mode: 'optimistic', version: undefined },
        }),
      ]);

      if (!target) throw new NotFoundException(`Target patient ${targetId} not found`);
      if (!source) throw new NotFoundException(`Source patient ${sourceId} not found`);
      if (source.id === target.id)
        throw new BadRequestException('Cannot merge a patient with itself');

      await qr.manager.save(
        AuditLogEntity,
        qr.manager.create(AuditLogEntity, {
          userId: adminId,
          action: 'PATIENT_MERGING',
          entity: 'Patient',
          entityId: target.id,
          severity: 'HIGH',
          description: reason ?? 'Admin-initiated patient merge',
          details: { primaryId: target.id, secondaryId: source.id },
        }),
      );

      for (const table of [
        'records',
        'medical_records',
        'access_grants',
        'billing',
        'prescriptions',
      ]) {
        await qr.manager.update(table, { patientId: source.id }, { patientId: target.id });
      }

      source.isActive = false;
      await qr.manager.save(Patient, source);

      let stellarTxHash: string | null = null;
      try {
        const txResult = await this.stellarService.invokeContract(
          target.stellarAddress ?? target.id,
          'merge_patient',
          [],
        );
        stellarTxHash = txResult?.txHash ?? null;
      } catch (error) {
        // Merge should still succeed even if the blockchain audit write fails.
      }

      await qr.manager.save(
        AuditLogEntity,
        qr.manager.create(AuditLogEntity, {
          userId: adminId,
          action: 'PATIENT_MERGED',
          entity: 'Patient',
          entityId: target.id,
          severity: 'HIGH',
          description: reason ?? 'Patient merge completed',
          details: { primaryId: target.id, secondaryId: source.id, reason },
          stellarTxHash: stellarTxHash ?? undefined,
        }),
      );

      await qr.commitTransaction();
      return target;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
      await Promise.all(lockKeys.map((k) => this.redisLock.releaseLock(k)));
    }
  }

  async adminMergePatients(dto: AdminMergePatientsDto, adminId: string): Promise<Patient> {
    return this.mergePatients(dto.secondaryAddress, dto.primaryAddress, adminId, dto.reason);
  }
}
