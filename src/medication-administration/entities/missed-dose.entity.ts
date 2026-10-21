import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MedicationAdministrationRecord } from './medication-administration-record.entity';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';

export enum MissedDoseReason {
  PATIENT_REFUSED = 'patient_refused',
  PATIENT_UNAVAILABLE = 'patient_unavailable',
  MEDICATION_UNAVAILABLE = 'medication_unavailable',
  HELD_BY_PHYSICIAN = 'held_by_physician',
  PATIENT_NPO = 'patient_npo',
  PATIENT_SLEEPING = 'patient_sleeping',
  PROCEDURE_IN_PROGRESS = 'procedure_in_progress',
  MEDICATION_ERROR = 'medication_error',
  OTHER = 'other',
}

export enum FollowUpStatus {
  PENDING = 'pending',
  CONTACTED_PHYSICIAN = 'contacted_physician',
  RESCHEDULED = 'rescheduled',
  DISCONTINUED = 'discontinued',
  RESOLVED = 'resolved',
}

@Entity('missed_doses')
@Index(['patientId', 'missedDate'])
@Index(['followUpStatus'])
@Index('UQ_missed_doses_mar_id', ['marId'], { unique: true })
export class MissedDose extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MedicationAdministrationRecord)
  @JoinColumn({ name: 'mar_id' })
  medicationAdministrationRecord: MedicationAdministrationRecord;

  @Column({ name: 'mar_id', type: 'uuid' })
  marId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  @Index()
  patientId: string;

  @Column({ name: 'medication_name', length: 255 })
  medicationName: string;

  @Column({ name: 'scheduled_time', type: 'timestamp' })
  scheduledTime: Date;

  @Column({ name: 'missed_date', type: 'date' })
  @Index()
  missedDate: Date;

  @Column({
    name: 'reason',
    type: 'enum',
    enum: MissedDoseReason,
  })
  reason: MissedDoseReason;

  @Column({ name: 'reason_details', type: 'text', nullable: true })
  reasonDetails: string;

  @Column({ name: 'nurse_id', type: 'uuid' })
  nurseId: string;

  @Column({ name: 'nurse_name', length: 255 })
  nurseName: string;

  @Column({
    name: 'follow_up_status',
    type: 'enum',
    enum: FollowUpStatus,
    default: FollowUpStatus.PENDING,
  })
  @Index()
  followUpStatus: FollowUpStatus;

  @Column({ name: 'follow_up_notes', type: 'text', nullable: true })
  followUpNotes: string;

  @Column({ name: 'physician_notified', type: 'boolean', default: false })
  physicianNotified: boolean;

  @Column({ name: 'physician_notification_time', type: 'timestamp', nullable: true })
  physicianNotificationTime: Date;

  @Column({ name: 'rescheduled_time', type: 'timestamp', nullable: true })
  rescheduledTime: Date;

  @Column({ name: 'is_critical_medication', type: 'boolean', default: false })
  isCriticalMedication: boolean;

  @Column({ name: 'alert_sent', type: 'boolean', default: false })
  alertSent: boolean;

  @Column({ name: 'alert_sent_time', type: 'timestamp', nullable: true })
  alertSentTime: Date;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
