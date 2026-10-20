import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Represents a webhook subscription for healthcare event notifications.
 * Subscribers register their endpoint URLs to receive notifications for specific events.
 */
@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant/organization ID for multi-tenancy */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  /** User who owns this subscription */
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Target endpoint URL where events will be POSTed */
  @Column({ type: 'varchar', length: 512 })
  url: string;

  /** Event types to subscribe to (comma-separated or JSON array) */
  @Column({ type: 'jsonb' })
  events: string[]; // e.g., ['patient.created', 'prescription.issued', 'lab.result.available']

  /** Shared secret for HMAC signature verification (never selected by default) */
  @Column({ type: 'varchar', length: 256, nullable: true, select: false })
  secret: string | null;

  /** Is this subscription currently active */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Retry policy: max attempts for delivery */
  @Column({ type: 'integer', default: 5 })
  maxRetries: number;

  /** Retry policy: delay in seconds between retries */
  @Column({ type: 'integer', default: 30 })
  retryDelaySeconds: number;

  /** Rate limit: max deliveries per minute */
  @Column({ type: 'integer', nullable: true })
  rateLimitPerMinute: number | null;

  /** Last successful delivery timestamp */
  @Column({ type: 'timestamp', nullable: true })
  lastSuccessAt: Date | null;

  /** Last failed delivery timestamp */
  @Column({ type: 'timestamp', nullable: true })
  lastFailureAt: Date | null;

  /** Consecutive failure count */
  @Column({ type: 'integer', default: 0 })
  consecutiveFailures: number;

  /** Metadata: custom headers, authentication, etc. */
  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
