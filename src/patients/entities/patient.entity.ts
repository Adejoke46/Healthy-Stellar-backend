import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
} from '../types/notification-preferences.type';

export enum PatientSex {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  UNKNOWN = 'unknown',
}

export enum PatientBloodGroup {
  A_PLUS = 'A+',
  A_MINUS = 'A-',
  B_PLUS = 'B+',
  B_MINUS = 'B-',
  AB_PLUS = 'AB+',
  AB_MINUS = 'AB-',
  O_PLUS = 'O+',
  O_MINUS = 'O-',
}

@Entity('patients')
export class Patient {
  /**
   * -----------------------------
   * Core Identifiers
   * -----------------------------
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  mrn: string;

  /**
   * -----------------------------
   * Personal Demographics
   * -----------------------------
   */
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  middleName?: string;

  @Column({ type: 'date' })
  dateOfBirth: string;

  @Column({
    type: 'enum',
    enum: PatientSex,
    default: PatientSex.UNKNOWN,
  })
  sex: PatientSex;

  @Column({ nullable: true })
  genderIdentity?: string;

  /**
   * -----------------------------
   * Medical Demographics
   * -----------------------------
   */
  @Column({
    type: 'enum',
    enum: PatientBloodGroup,
    nullable: true,
  })
  bloodGroup?: PatientBloodGroup;

  @Column('json', { nullable: true })
  knownAllergies?: string[];

  @Column({ nullable: true })
  primaryLanguage?: string;

  @Column({ nullable: true })
  nationality?: string;

  @Column({ nullable: true })
  ethnicity?: string;

  @Column({ nullable: true })
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'other';

  /**
   * -----------------------------
   * Contact Information
   * -----------------------------
   */
  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column('json', { nullable: true })
  address?: any;

  @Column({ default: false })
  isPhoneVerified: boolean;

  /**
   * -----------------------------
   * Identification & Media
   * -----------------------------
   */
  @Column({ nullable: true })
  patientPhotoUrl?: string; // clinical identification photo

  @Column({ nullable: true, unique: true })
  nationalId?: string;

  @Column({ nullable: true })
  nationalIdType?: string; // e.g., Passport, SSN, NIN

  /**
   * PHI: Social Security Number -- encrypted via key-managed transformer.
   * Encryption/decryption handled by PhiColumnEncryptionService at the service layer.
   * Raw column value is base64-encoded AES-256-GCM ciphertext.
   */
  @Column({ type: 'text', nullable: true })
  ssn?: string;

  /**
   * HMAC-SHA256 index of the plaintext SSN for exact-match lookup.
   * Keyed with the patient DEK from KeyManagementService.
   */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  ssnHmac?: string;

  /**
   * -----------------------------
   * Stellar / Blockchain Identity
   * -----------------------------
   */
  @Index()
  @Column({ nullable: true, unique: true })
  stellarAddress?: string; // immutable once set

  @Column({ nullable: true })
  nationalIdHash?: string; // SHA-256 hash of national ID — immutable once set

  /**
   * -----------------------------
   * Off-chain Profile Metadata
   * -----------------------------
   */
  @Column('json', { nullable: true })
  contactPreferences?: Record<string, any>; // e.g. { preferredChannel: 'email', language: 'en' }

  @Column('json', { nullable: true })
  emergencyContact?: Record<string, any>; // e.g. { name, phone, relationship }

  /** Tenant-specific extended attributes (e.g. local insurance numbers, national ID formats). */
  @Column('json', { nullable: true })
  customFields?: Record<string, string>;

  /**
   * -----------------------------
   * Administrative / Workflow
   * -----------------------------
   */
  @Column({ default: false })
  isAdmitted: boolean;

  @Column({ nullable: true, type: 'date' })
  admissionDate?: string;

  @Column({ nullable: true, type: 'date' })
  dischargeDate?: string;

  @Column({ default: true })
  isActive: boolean; // archived vs active

  /** Authenticated user who registered this patient (JWT userId). */
  @Column({ type: 'varchar', nullable: true })
  registeredBy?: string | null;

  /**
   * -----------------------------
   * Geo-Restriction
   * -----------------------------
   * ISO 3166-1 alpha-2 country codes that are allowed to access this patient's records.
   * Empty array = no restriction.
   */
  @Column('simple-array', { nullable: true, default: null })
  allowedCountries: string[] | null;

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => `'${JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)}'`,
  })
  notificationPreferences: NotificationPreferences;

  /**
   * -----------------------------
   * System Metadata
   * -----------------------------
   */
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Optimistic concurrency — incremented by TypeORM on every save */
  @VersionColumn({ default: 0 })
  version: number;
}

export default Patient;
