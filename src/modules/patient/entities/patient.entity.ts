// src/modules/patient/entities/patient.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum BloodType {
  A_POSITIVE = 'A+',
  A_NEGATIVE = 'A-',
  B_POSITIVE = 'B+',
  B_NEGATIVE = 'B-',
  AB_POSITIVE = 'AB+',
  AB_NEGATIVE = 'AB-',
  O_POSITIVE = 'O+',
  O_NEGATIVE = 'O-',
  UNKNOWN = 'unknown',
}

export enum PatientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DECEASED = 'deceased',
  MERGED = 'merged',
}

export enum MaritalStatus {
  SINGLE = 'single',
  MARRIED = 'married',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
  SEPARATED = 'separated',
}

@Entity('patients')
@Index(['mrn'], { unique: true })
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['phoneNumber'])
@Index(['nationalId'], { unique: true, where: 'national_id IS NOT NULL' })
@Index(['firstName', 'lastName', 'dateOfBirth'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  mrn: string; // Medical Record Number

  // Personal Information
  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  middleName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'date' })
  dateOfBirth: Date;

  @Column({
    type: 'enum',
    enum: Gender,
  })
  gender: Gender;

  @Column({ type: 'varchar', length: 255, nullable: true })
  photoUrl: string;

  // Contact Information
  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 100 })
  state: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string;

  @Column({ type: 'varchar', length: 100, default: 'Nigeria' })
  country: string;

  // Identification
  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  nationalId: string; // NIN, BVN, etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  passportNumber: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  driversLicense: string;

  // Demographics
  @Column({
    type: 'enum',
    enum: BloodType,
    default: BloodType.UNKNOWN,
  })
  bloodType: BloodType;

  @Column({
    type: 'enum',
    enum: MaritalStatus,
    nullable: true,
  })
  maritalStatus: MaritalStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  occupation: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  religion: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ethnicity: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  preferredLanguage: string;

  // Emergency Contact
  @Column({ type: 'varchar', length: 200, nullable: true })
  emergencyContactName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  emergencyContactRelationship: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  emergencyContactPhone: string;

  // Insurance Information
  @Column({ type: 'varchar', length: 200, nullable: true })
  insuranceProvider: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  insurancePolicyNumber: string;

  @Column({ type: 'date', nullable: true })
  insuranceExpiryDate: Date;

  // Medical Information
  @Column({ type: 'text', nullable: true })
  allergies: string;

  @Column({ type: 'text', nullable: true })
  chronicConditions: string;

  @Column({ type: 'text', nullable: true })
  currentMedications: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Status and Tracking
  @Column({
    type: 'enum',
    enum: PatientStatus,
    default: PatientStatus.ACTIVE,
  })
  status: PatientStatus;

  @Column({ type: 'uuid', nullable: true })
  mergedIntoPatientId: string; // If merged, points to master patient

  @Column({ type: 'timestamp', nullable: true })
  lastVisitDate: Date;

  @Column({ type: 'int', default: 0 })
  totalVisits: number;

  // Privacy and Security
  @Column({ type: 'boolean', default: false })
  isVip: boolean;

  @Column({ type: 'boolean', default: false })
  @Exclude()
  isRestricted: boolean; // Requires special permission to view

  @Column({ type: 'simple-array', nullable: true })
  @Exclude()
  authorizedUserIds: string[]; // Users authorized to view restricted patients

  // Audit Fields
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  // Computed Properties
  get fullName(): string {
    return this.middleName
      ? `${this.firstName} ${this.middleName} ${this.lastName}`
      : `${this.firstName} ${this.lastName}`;
  }

  get age(): number {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }
}

// src/modules/patient/entities/patient-duplicate.entity.ts
@Entity('patient_duplicates')
export class PatientDuplicate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  patient1Id: string;

  @Column({ type: 'uuid' })
  patient2Id: string;

  @Column({ type: 'float' })
  similarityScore: number; // 0-100

  @Column({ type: 'jsonb' })
  matchingFields: {
    firstName?: boolean;
    lastName?: boolean;
    dateOfBirth?: boolean;
    phoneNumber?: boolean;
    email?: boolean;
    nationalId?: boolean;
  };

  @Column({ type: 'enum', enum: ['pending', 'confirmed', 'dismissed'] })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// src/modules/patient/entities/patient-audit-log.entity.ts
@Entity('patient_audit_logs')
export class PatientAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  patientId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  action: string; // VIEW, CREATE, UPDATE, DELETE, MERGE, SEARCH

  @Column({ type: 'jsonb', nullable: true })
  changes: any;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}

// src/modules/patient/dto/create-patient.dto.ts
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../../common/constants/swagger.constants';
import { Gender, BloodType, MaritalStatus } from '../entities/patient.entity';

export class CreatePatientDto {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  middleName?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  lastName: string;

  @ApiProperty()
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty()
  @IsString()
  @Matches(/^(\+234|0)[0-9]{10}$/, {
    message: 'Phone number must be valid Nigerian format',
  })
  phoneNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportNumber?: string;

  @ApiPropertyOptional({ enum: BloodType })
  @IsOptional()
  @IsEnum(BloodType)
  bloodType?: BloodType;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelationship?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chronicConditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;
}

// src/modules/patient/dto/search-patient.dto.ts
export class SearchPatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mrn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['active', 'inactive', 'deceased'])
  status?: string;
}

// src/modules/patient/dto/merge-patients.dto.ts
export class MergePatientsDto {
  @ApiProperty()
  @IsString()
  masterPatientId: string;

  @ApiProperty()
  @IsString()
  duplicatePatientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

// src/modules/patient/services/mrn-generator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';

@Injectable()
export class MrnGeneratorService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {}

  /**
   * Generate a unique Medical Record Number
   * Format: HHS-YYYY-NNNNNN (HHS = Healthy-Stellar, YYYY = Year, NNNNNN = Sequential)
   */
  async generateMrn(): Promise<string> {
    const prefix = 'HHS';
    const year = new Date().getFullYear();

    // Get the count of patients created this year
    const startOfYear = new Date(year, 0, 1);
    const count = await this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.createdAt >= :startOfYear', { startOfYear })
      .getCount();

    const sequence = (count + 1).toString().padStart(6, '0');
    const mrn = `${prefix}-${year}-${sequence}`;

    // Verify uniqueness (should never happen, but safety check)
    const exists = await this.patientRepository.findOne({ where: { mrn } });
    if (exists) {
      // Add random suffix if collision (extremely unlikely)
      const randomSuffix = Math.floor(Math.random() * 99)
        .toString()
        .padStart(2, '0');
      return `${mrn}-${randomSuffix}`;
    }

    return mrn;
  }

  /**
   * Validate MRN format
   */
  isValidMrn(mrn: string): boolean {
    const mrnRegex = /^HHS-\d{4}-\d{6}(-\d{2})?$/;
    return mrnRegex.test(mrn);
  }
}

// src/modules/patient/services/duplicate-detection.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { PatientDuplicate } from '../entities/patient-duplicate.entity';
import levenshtein from 'fast-levenshtein';

interface DuplicateMatch {
  patient: Patient;
  score: number;
  matchingFields: string[];
}

@Injectable()
export class DuplicateDetectionService {
  private readonly THRESHOLD = 70; // Similarity threshold (0-100)

  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(PatientDuplicate)
    private readonly duplicateRepository: Repository<PatientDuplicate>,
  ) {}

  /**
   * Find potential duplicates for a patient
   */
  async findPotentialDuplicates(patientData: Partial<Patient>): Promise<DuplicateMatch[]> {
    const candidates: Patient[] = [];

    // Search by exact matches first
    if (patientData.nationalId) {
      const byNationalId = await this.patientRepository.find({
        where: { nationalId: patientData.nationalId },
      });
      candidates.push(...byNationalId);
    }

    if (patientData.email) {
      const byEmail = await this.patientRepository.find({
        where: { email: patientData.email },
      });
      candidates.push(...byEmail);
    }

    if (patientData.phoneNumber) {
      const byPhone = await this.patientRepository.find({
        where: { phoneNumber: patientData.phoneNumber },
      });
      candidates.push(...byPhone);
    }

    // Search by name and DOB similarity
    const byNameDob = await this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.dateOfBirth = :dob', { dob: patientData.dateOfBirth })
      .andWhere(
        '(LOWER(patient.firstName) LIKE :firstName OR LOWER(patient.lastName) LIKE :lastName)',
        {
          firstName: `%${patientData.firstName?.toLowerCase()}%`,
          lastName: `%${patientData.lastName?.toLowerCase()}%`,
        },
      )
      .getMany();

    candidates.push(...byNameDob);

    // Remove duplicates and calculate scores
    const uniqueCandidates = Array.from(new Map(candidates.map((c) => [c.id, c])).values());

    const matches: DuplicateMatch[] = uniqueCandidates
      .map((candidate) => {
        const score = this.calculateSimilarityScore(patientData, candidate);
        const matchingFields = this.getMatchingFields(patientData, candidate);

        return {
          patient: candidate,
          score,
          matchingFields,
        };
      })
      .filter((match) => match.score >= this.THRESHOLD)
      .sort((a, b) => b.score - a.score);

    // Log potential duplicates
    for (const match of matches) {
      await this.logPotentialDuplicate(patientData.id, match.patient.id, match.score);
    }

    return matches;
  }

  /**
   * Calculate similarity score between two patients
   */
  private calculateSimilarityScore(patient1: Partial<Patient>, patient2: Patient): number {
    let totalScore = 0;
    let weightSum = 0;

    // Name similarity (weight: 30)
    if (patient1.firstName && patient2.firstName) {
      const firstNameSimilarity = this.stringSimilarity(patient1.firstName, patient2.firstName);
      totalScore += firstNameSimilarity * 15;
      weightSum += 15;
    }

    if (patient1.lastName && patient2.lastName) {
      const lastNameSimilarity = this.stringSimilarity(patient1.lastName, patient2.lastName);
      totalScore += lastNameSimilarity * 15;
      weightSum += 15;
    }

    // Date of birth (weight: 25)
    if (patient1.dateOfBirth && patient2.dateOfBirth) {
      const dobMatch =
        new Date(patient1.dateOfBirth).getTime() === new Date(patient2.dateOfBirth).getTime();
      totalScore += dobMatch ? 25 : 0;
      weightSum += 25;
    }

    // Phone number (weight: 20)
    if (patient1.phoneNumber && patient2.phoneNumber) {
      const phoneMatch = patient1.phoneNumber === patient2.phoneNumber;
      totalScore += phoneMatch ? 20 : 0;
      weightSum += 20;
    }

    // Email (weight: 15)
    if (patient1.email && patient2.email) {
      const emailMatch = patient1.email.toLowerCase() === patient2.email.toLowerCase();
      totalScore += emailMatch ? 15 : 0;
      weightSum += 15;
    }

    // National ID (weight: 10)
    if (patient1.nationalId && patient2.nationalId) {
      const idMatch = patient1.nationalId === patient2.nationalId;
      totalScore += idMatch ? 10 : 0;
      weightSum += 10;
    }

    return weightSum > 0 ? (totalScore / weightSum) * 100 : 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    const maxLength = Math.max(s1.length, s2.length);

    if (maxLength === 0) return 1;

    const distance = levenshtein.get(s1, s2);
    return 1 - distance / maxLength;
  }

  /**
   * Get matching fields between two patients
   */
  private getMatchingFields(patient1: Partial<Patient>, patient2: Patient): string[] {
    const matches: string[] = [];

    if (patient1.firstName?.toLowerCase() === patient2.firstName.toLowerCase()) {
      matches.push('firstName');
    }
    if (patient1.lastName?.toLowerCase() === patient2.lastName.toLowerCase()) {
      matches.push('lastName');
    }
    if (
      patient1.dateOfBirth &&
      new Date(patient1.dateOfBirth).getTime() === new Date(patient2.dateOfBirth).getTime()
    ) {
      matches.push('dateOfBirth');
    }
    if (patient1.phoneNumber === patient2.phoneNumber) {
      matches.push('phoneNumber');
    }
    if (patient1.email?.toLowerCase() === patient2.email?.toLowerCase()) {
      matches.push('email');
    }
    if (patient1.nationalId === patient2.nationalId) {
      matches.push('nationalId');
    }

    return matches;
  }

  /**
   * Log a potential duplicate
   */
  private async logPotentialDuplicate(
    patient1Id: string,
    patient2Id: string,
    score: number,
  ): Promise<void> {
    const existing = await this.duplicateRepository.findOne({
      where: [
        { patient1Id, patient2Id },
        { patient1Id: patient2Id, patient2Id: patient1Id },
      ],
    });

    if (!existing) {
      await this.duplicateRepository.save({
        patient1Id,
        patient2Id,
        similarityScore: score,
        matchingFields: {},
        status: 'pending',
      });
    }
  }
}

// src/modules/patient/services/patient.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Patient, PatientStatus } from '../entities/patient.entity';
import { PatientAuditLog } from '../entities/patient-audit-log.entity';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { SearchPatientDto } from '../dto/search-patient.dto';
import { MergePatientsDto } from '../dto/merge-patients.dto';
import { MrnGeneratorService } from './mrn-generator.service';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(PatientAuditLog)
    private readonly auditLogRepository: Repository<PatientAuditLog>,
    private readonly mrnGenerator: MrnGeneratorService,
    private readonly duplicateDetection: DuplicateDetectionService,
  ) {}

  /**
   * Create a new patient with duplicate detection
   */
  async create(createPatientDto: CreatePatientDto, userId: string): Promise<Patient> {
    // Check for duplicates
    const duplicates = await this.duplicateDetection.findPotentialDuplicates({
      ...createPatientDto,
      dateOfBirth: new Date(createPatientDto.dateOfBirth),
    });

    if (duplicates.length > 0) {
      throw new ConflictException({
        message: 'Potential duplicate patient(s) detected',
        duplicates: duplicates.map((d) => ({
          id: d.patient.id,
          mrn: d.patient.mrn,
          fullName: d.patient.fullName,
          dateOfBirth: d.patient.dateOfBirth,
          phoneNumber: d.patient.phoneNumber,
          score: d.score,
          matchingFields: d.matchingFields,
        })),
      });
    }

    // Generate MRN
    const mrn = await this.mrnGenerator.generateMrn();

    // Create patient
    const patient = this.patientRepository.create({
      ...createPatientDto,
      mrn,
      dateOfBirth: new Date(createPatientDto.dateOfBirth),
      createdBy: userId,
      updatedBy: userId,
    });

    const savedPatient = await this.patientRepository.save(patient);

    // Audit log
    await this.logAction(savedPatient.id, userId, 'CREATE', { patient: savedPatient });

    return savedPatient;
  }

  /**
   * Find patient by MRN with privacy checks
   */
  async findByMrn(mrn: string, userId: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ where: { mrn } });

    if (!patient) {
      throw new NotFoundException(`Patient with MRN ${mrn} not found`);
    }

    this.checkPrivacyAccess(patient, userId);

    // Audit log
    await this.logAction(patient.id, userId, 'VIEW');

    return patient;
  }

  /**
   * Search patients with privacy controls
   */
  async search(searchDto: SearchPatientDto, userId: string): Promise<Patient[]> {
    const queryBuilder = this.patientRepository.createQueryBuilder('patient');

    // Apply search filters
    if (searchDto.mrn) {
      queryBuilder.andWhere('patient.mrn = :mrn', { mrn: searchDto.mrn });
    }

    if (searchDto.firstName) {
      queryBuilder.andWhere('LOWER(patient.firstName) LIKE LOWER(:firstName)', {
        firstName: `%${searchDto.firstName}%`,
      });
    }

    if (searchDto.lastName) {
      queryBuilder.andWhere('LOWER(patient.lastName) LIKE LOWER(:lastName)', {
        lastName: `%${searchDto.lastName}%`,
      });
    }

    if (searchDto.dateOfBirth) {
      queryBuilder.andWhere('patient.dateOfBirth = :dob', {
        dob: new Date(searchDto.dateOfBirth),
      });
    }

    if (searchDto.phoneNumber) {
      queryBuilder.andWhere('patient.phoneNumber = :phone', {
        phone: searchDto.phoneNumber,
      });
    }

    if (searchDto.nationalId) {
      queryBuilder.andWhere('patient.nationalId = :nationalId', {
        nationalId: searchDto.nationalId,
      });
    }

    if (searchDto.gender) {
      queryBuilder.andWhere('patient.gender = :gender', { gender: searchDto.gender });
    }

    if (searchDto.status) {
      queryBuilder.andWhere('patient.status = :status', { status: searchDto.status });
    }

    // General query search
    if (searchDto.query) {
      queryBuilder.andWhere(
        '(LOWER(patient.firstName) LIKE LOWER(:query) OR ' +
          'LOWER(patient.lastName) LIKE LOWER(:query) OR ' +
          'patient.mrn LIKE :query OR ' +
          'patient.phoneNumber LIKE :query)',
        { query: `%${searchDto.query}%` },
      );
    }

    // Privacy filter - exclude restricted patients unless authorized
    queryBuilder.andWhere(
      '(patient.isRestricted = false OR :userId = ANY(patient.authorizedUserIds))',
      { userId },
    );

    const patients = await queryBuilder.limit(50).getMany();

    // Audit log
    await this.logAction(null, userId, 'SEARCH', { criteria: searchDto });

    return patients;
  }

  /**
   * Update patient
   */
  async update(id: string, updateDto: Partial<CreatePatientDto>, userId: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ where: { id } });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    this.checkPrivacyAccess(patient, userId);

    const oldData = { ...patient };

    Object.assign(patient, updateDto);
    patient.updatedBy = userId;

    const updated = await this.patientRepository.save(patient);

    // Audit log
    await this.logAction(id, userId, 'UPDATE', { before: oldData, after: updated });

    return updated;
  }

  /**
   * Merge duplicate patients
   */
  async mergePatients(mergeDto: MergePatientsDto, userId: string): Promise<Patient> {
    const masterPatient = await this.patientRepository.findOne({
      where: { id: mergeDto.masterPatientId },
    });
    const duplicatePatient = await this.patientRepository.findOne({
      where: { id: mergeDto.duplicatePatientId },
    });

    if (!masterPatient || !duplicatePatient) {
      throw new NotFoundException('One or both patients not found');
    }

    if (masterPatient.id === duplicatePatient.id) {
      throw new BadRequestException('Cannot merge a patient with itself');
    }

    // Mark duplicate as merged
    duplicatePatient.status = PatientStatus.MERGED;
    duplicatePatient.mergedIntoPatientId = masterPatient.id;
    await this.patientRepository.save(duplicatePatient);

    // Merge visit count
    masterPatient.totalVisits += duplicatePatient.totalVisits;

    // Update last visit if duplicate is more recent
    if (
      duplicatePatient.lastVisitDate &&
      (!masterPatient.lastVisitDate || duplicatePatient.lastVisitDate > masterPatient.lastVisitDate)
    ) {
      masterPatient.lastVisitDate = duplicatePatient.lastVisitDate;
    }

    const updated = await this.patientRepository.save(masterPatient);

    // Audit log
    await this.logAction(masterPatient.id, userId, 'MERGE', {
      duplicatePatientId: duplicatePatient.id,
      reason: mergeDto.reason,
    });

    return updated;
  }

  /**
   * Upload patient photo
   */
  async uploadPhoto(patientId: string, photoUrl: string, userId: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ where: { id: patientId } });

    if (!patient) {
      throw new NotFoundException(`Patient not found`);
    }

    this.checkPrivacyAccess(patient, userId);

    patient.photoUrl = photoUrl;
    patient.updatedBy = userId;

    return await this.patientRepository.save(patient);
  }

  /**
   * Check privacy access
   */
  private checkPrivacyAccess(patient: Patient, userId: string): void {
    if (patient.isRestricted) {
      if (!patient.authorizedUserIds || !patient.authorizedUserIds.includes(userId)) {
        throw new ForbiddenException(
          'Access denied: You are not authorized to view this patient record',
        );
      }
    }
  }

  /**
   * Log audit action
   */
  private async logAction(
    patientId: string,
    userId: string,
    action: string,
    changes?: any,
  ): Promise<void> {
    await this.auditLogRepository.save({
      patientId,
      userId,
      action,
      changes,
    });
  }
}

// src/modules/patient/patient.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PatientService } from './services/patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { SearchPatientDto } from './dto/search-patient.dto';
import { MergePatientsDto } from './dto/merge-patients.dto';

@ApiTags('Patients')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('patients')
@UseInterceptors(ClassSerializerInterceptor)
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new patient' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Patient successfully created' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Potential duplicate detected' })
  async create(@Body() createPatientDto: CreatePatientDto, @Request() req) {
    return this.patientService.create(createPatientDto, req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search patients with privacy controls' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search results returned' })
  async search(@Query() searchDto: SearchPatientDto, @Request() req) {
    return this.patientService.search(searchDto, req.user.id);
  }

  @Get(':mrn')
  @ApiOperation({ summary: 'Get patient by MRN' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Patient found' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Patient not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async findByMrn(@Param('mrn') mrn: string, @Request() req) {
    return this.patientService.findByMrn(mrn, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update patient information' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Patient updated' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreatePatientDto>,
    @Request() req,
  ) {
    return this.patientService.update(id, updateDto, req.user.id);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge duplicate patients' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Patients merged successfully' })
  async merge(@Body() mergeDto: MergePatientsDto, @Request() req) {
    return this.patientService.mergePatients(mergeDto, req.user.id);
  }
}

// src/modules/patient/patient.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './entities/patient.entity';
import { PatientDuplicate } from './entities/patient-duplicate.entity';
import { PatientAuditLog } from './entities/patient-audit-log.entity';
import { PatientController } from './patient.controller';
import { PatientService } from './services/patient.service';
import { MrnGeneratorService } from './services/mrn-generator.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, PatientDuplicate, PatientAuditLog])],
  controllers: [PatientController],
  providers: [PatientService, MrnGeneratorService, DuplicateDetectionService],
  exports: [PatientService],
})
export class PatientModule {}
