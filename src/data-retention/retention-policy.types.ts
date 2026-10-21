/**
 * Entity types covered by automated retention policy enforcement.
 * Extend this union (and DEFAULT_ENTITY_POLICIES below) when a new
 * entity type needs to be brought under retention management.
 */
export type RetentionEntityType =
  | 'medical_records'
  | 'audit_logs'
  | 'appointment_logs'
  | 'session_tokens'
  | 'billing';

/** What to do with a record once it has exceeded its retention period. */
export type RetentionAction = 'archive_and_delete' | 'anonymize' | 'soft_delete';

export interface RetentionPolicy {
  /** Stable identifier for this policy, used as the aggregate id on emitted events. */
  id: string;
  entityType: RetentionEntityType;
  /** Retention period expressed in days (preferred — supports sub-year granularity). */
  retentionDays: number;
  action: RetentionAction;
  /** Number of rows processed per batch by the enforcement job. */
  batchSize?: number;
  /** When true, nothing of this entity type may be purged, anonymised or deleted (litigation / regulatory hold). */
  legalHold?: boolean;
}

/** Per-tenant override of one or more entity-type policies. */
export interface TenantRetentionOverride {
  tenantId: string;
  policies: Partial<
    Record<RetentionEntityType, Partial<Pick<RetentionPolicy, 'retentionDays' | 'action' | 'batchSize' | 'legalHold'>>>
  >;
}

export const DEFAULT_BATCH_SIZE = 500;

/** Global default policies, applied when no tenant-specific override exists. */
export const DEFAULT_ENTITY_POLICIES: Record<RetentionEntityType, RetentionPolicy> = {
  medical_records: {
    id: 'default-medical_records',
    entityType: 'medical_records',
    retentionDays: 7 * 365,
    action: 'anonymize',
    batchSize: DEFAULT_BATCH_SIZE,
  },
  audit_logs: {
    id: 'default-audit_logs',
    entityType: 'audit_logs',
    retentionDays: 7 * 365,
    action: 'archive_and_delete',
    batchSize: DEFAULT_BATCH_SIZE,
  },
  // Appointment logs: 7 years, per issue #759.
  appointment_logs: {
    id: 'default-appointment_logs',
    entityType: 'appointment_logs',
    retentionDays: 7 * 365,
    action: 'archive_and_delete',
    batchSize: DEFAULT_BATCH_SIZE,
  },
  // Session tokens: 90 days, per issue #759.
  session_tokens: {
    id: 'default-session_tokens',
    entityType: 'session_tokens',
    retentionDays: 90,
    action: 'archive_and_delete',
    batchSize: DEFAULT_BATCH_SIZE,
  },
  billing: {
    id: 'default-billing',
    entityType: 'billing',
    retentionDays: 7 * 365,
    action: 'soft_delete',
    batchSize: DEFAULT_BATCH_SIZE,
  },
};

export interface RetentionRecordRef {
  id: string;
  tenantId: string | null;
  createdAt: Date;
  /** Full row snapshot, persisted verbatim to the archive before deletion. */
  payload: Record<string, unknown>;
}

export interface BatchOutcome {
  policyId: string;
  entityType: RetentionEntityType;
  tenantId: string | null;
  action: RetentionAction;
  recordCount: number;
  archivedCount: number;
  anonymizedCount: number;
  deletedCount: number;
  dryRun: boolean;
  cutoffDate: Date;
}

export interface RetentionRunReport {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  batches: BatchOutcome[];
  totalRecords: number;
  totalArchived: number;
  totalAnonymized: number;
  totalDeleted: number;
  errors: Array<{ entityType: RetentionEntityType; tenantId: string | null; message: string }>;
}
