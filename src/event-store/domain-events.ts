/** Base interface every domain event must satisfy. */
export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly version?: number;
}

// ── Concrete domain events ────────────────────────────────────────────────────

export class RecordUploaded implements DomainEvent {
  readonly eventType = 'RecordUploaded';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { patientId: string; cid: string; recordType: string; uploadedBy: string },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class AccessGranted implements DomainEvent {
  readonly eventType = 'AccessGranted';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { grantedTo: string; grantedBy: string; expiresAt?: string },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class AccessRevoked implements DomainEvent {
  readonly eventType = 'AccessRevoked';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { revokedFrom: string; revokedBy: string; reason?: string },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class RecordAmended implements DomainEvent {
  readonly eventType = 'RecordAmended';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { amendedBy: string; changes: Record<string, unknown> },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class EmergencyAccessCreated implements DomainEvent {
  readonly eventType = 'EmergencyAccessCreated';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { accessedBy: string; reason: string; expiresAt: string },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

export class RecordDeleted implements DomainEvent {
  readonly eventType = 'RecordDeleted';
  readonly aggregateType = 'MedicalRecord';
  constructor(
    readonly aggregateId: string,
    readonly payload: { deletedBy: string; reason?: string },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}

/**
 * Emitted once per batch by the data-retention enforcement job for
 * observability/audit purposes. One event per (policy, tenant, batch).
 */
export class RetentionBatchProcessed implements DomainEvent {
  readonly eventType = 'retention.batch_processed';
  readonly aggregateType = 'RetentionPolicy';
  constructor(
    readonly aggregateId: string,
    readonly payload: {
      policyId: string;
      entityType: string;
      tenantId: string | null;
      action: string;
      recordCount: number;
      archivedCount: number;
      anonymizedCount: number;
      deletedCount: number;
      dryRun: boolean;
      cutoffDate: string;
    },
    readonly metadata: Record<string, unknown> = {},
  ) {}
}
