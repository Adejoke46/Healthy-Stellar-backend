import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { MfaEntity } from './mfa.entity';
import { SessionEntity } from './session.entity';
import { AuditLogEntity } from '../../common/audit/audit-log.entity';
import type { Patient } from '../../users/entities/patient.entity';

export enum UserRole {
  ADMIN = 'admin',
  PHYSICIAN = 'physician',
  NURSE = 'nurse',
  PATIENT = 'patient',
  BILLING_STAFF = 'billing_staff',
  MEDICAL_RECORDS = 'medical_records',
  SUPER_ADMIN = 'super_admin',
  COMPLIANCE_OFFICER = 'compliance_officer',
  SURGEON = 'surgeon',
  PHARMACIST = 'pharmacist',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true, length: 200 })
  displayName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PATIENT })
  role: UserRole;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: false })
  isLicenseVerified: boolean;

  @Column({ nullable: true, length: 100 })
  country: string;

  @Column({ default: true })
  isAcceptingPatients: boolean;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ nullable: true })
  mfaSecret: string;

  @Column({ nullable: true })
  lastPasswordChangeAt: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lockedUntil: Date;

  @Column({ default: false })
  requiresPasswordChange: boolean;

  @Column({ nullable: true, length: 255 })
  licenseNumber: string;

  @Column({ nullable: true, length: 255 })
  npi: string;

  @Column({ type: 'text', nullable: true })
  specialization: string;

  @Column({ default: true })
  emergencyAccessEnabled: boolean;

  @Column({ nullable: true, length: 255 })
  specialty: string;

  @Column({ nullable: true, length: 255 })
  institution: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId: string;

  @Column({ nullable: true, length: 255, select: false })
  stellarPublicKey: string;

  @Column({ type: 'tsvector', nullable: true, select: false })
  search_vector: string;

  @Column({ type: 'simple-array', nullable: true })
  permissions: string[];

  /** User status (active, suspended, etc.) */
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'date', nullable: true })
  licenseExpiryDate: Date;

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'timestamp', nullable: true })
  licenseVerifiedAt: Date;

  @Column({ nullable: true })
  verifiedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  lastAccessRevocationAt: Date;

  @Column({ nullable: true })
  revocationReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * SHA-256 hash of the password-reset token. The raw token is only ever
   * sent to the user via email; only its hash is persisted so that a leaked
   * database/backup/replica does not expose usable reset tokens.
   */
  @Column({ nullable: true, length: 64, select: false })
  passwordResetToken: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetTokenExpiresAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;

  @OneToOne(() => Patient, (patient) => patient.user, { nullable: true })
  patientProfile: Patient;

  @OneToMany(() => MfaEntity, (mfa) => mfa.user, { cascade: true })
  mfaDevices: MfaEntity[];

  @OneToMany(() => SessionEntity, (session) => session.user, { cascade: true })
  sessions: SessionEntity[];

  @OneToMany(() => AuditLogEntity, (log) => log.user)
  auditLogs: AuditLogEntity[];
}
