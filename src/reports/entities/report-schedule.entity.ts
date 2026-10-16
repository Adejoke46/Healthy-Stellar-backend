import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReportFormat } from './report-job.entity';

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('report_schedules')
@Index(['isActive'])
@Index(['tenantId'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant; all admin CRUD is scoped to the caller's tenant. */
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null;

  @Column()
  reportType: string;

  @Column({ type: 'enum', enum: ReportFrequency })
  frequency: ReportFrequency;

  /** For weekly schedules: 0=Sunday … 6=Saturday. */
  @Column({ type: 'int', nullable: true })
  dayOfWeek: number | null;

  /** For monthly schedules: 1–28. */
  @Column({ type: 'int', nullable: true })
  dayOfMonth: number | null;

  @Column({ type: 'simple-array' })
  recipients: string[];

  @Column({ type: 'enum', enum: ReportFormat, default: ReportFormat.PDF })
  format: ReportFormat;

  @Column({ default: true })
  isActive: boolean;

  /** One-click unsubscribe token — unique per schedule. */
  @Column({ unique: true })
  unsubscribeToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
