import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThan, Like, Not, Repository } from 'typeorm';
import { Record as MedicalRecord } from '../../records/entities/record.entity';
import { AuditLogEntity } from '../../common/audit/audit-log.entity';
import { EventStoreService } from '../../event-store/event-store.service';
import { RetentionBatchProcessed } from '../../event-store/domain-events';
import { ArchiveService } from '../services/archive.service';
import { RetentionPolicyRegistryService } from '../services/retention-policy-registry.service';
import {
  BatchOutcome,
  RetentionAction,
  RetentionEntityType,
  RetentionPolicy,
  RetentionRecordRef,
  RetentionRunReport,
} from '../retention-policy.types';

/**
 * Entity types this job actively enforces against a wired repository.
 * `appointment_logs` and `session_tokens` policies are resolvable via
 * RetentionPolicyRegistryService (including tenant overrides) but are not
 * yet backed by a repository here — wiring a new entity type only requires
 * adding a branch to `fetchExpiredBatch`/`applyAction` below.
 */
const ENFORCED_ENTITY_TYPES: RetentionEntityType[] = ['medical_records', 'audit_logs'];

/** Prefix written to `patientId` on anonymised records (matches DataRetentionService). */
const ANONYMIZED_PREFIX = 'ANONYMIZED_';
/** LIKE pattern matching anonymised `patientId`s; `_` is escaped because it is a LIKE wildcard. */
const ANONYMIZED_LIKE_PATTERN = 'ANONYMIZED\\_%';

@Injectable()
export class RetentionEnforcementJob {
  private readonly logger = new Logger(RetentionEnforcementJob.name);

  constructor(
    @InjectRepository(MedicalRecord)
    private readonly recordRepo: Repository<MedicalRecord>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
    private readonly policyRegistry: RetentionPolicyRegistryService,
    private readonly archiveService: ArchiveService,
    private readonly eventStore: EventStoreService,
  ) {}

  /** Nightly scheduled enforcement run (archives + deletes expired records). */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runNightly(): Promise<RetentionRunReport> {
    return this.run(false);
  }

  /**
   * Dry-run report: identifies records that *would* be affected by the
   * current policies, without archiving, deleting, or emitting any
   * mutating events.
   */
  async runDryRun(): Promise<RetentionRunReport> {
    return this.run(true);
  }

  /**
   * Core enforcement loop. Iterates every enforced entity type across the
   * global policy plus every tenant with a registered override, batching
   * the expired rows and (unless dryRun) applying the policy action to each
   * batch before emitting an observability event for it.
   */
  async run(dryRun: boolean): Promise<RetentionRunReport> {
    const startedAt = new Date();
    this.logger.log(`RetentionEnforcementJob: starting run (dryRun=${dryRun})`);

    const report: RetentionRunReport = {
      dryRun,
      startedAt,
      finishedAt: startedAt,
      batches: [],
      totalRecords: 0,
      totalArchived: 0,
      totalAnonymized: 0,
      totalDeleted: 0,
      errors: [],
    };

    for (const entityType of ENFORCED_ENTITY_TYPES) {
      const tenantIds: Array<string | null> = [null, ...this.policyRegistry.getOverriddenTenantIds()];

      for (const tenantId of tenantIds) {
        try {
          const outcome = await this.processEntityTypeForTenant(entityType, tenantId, dryRun);
          if (outcome) {
            report.batches.push(outcome);
            report.totalRecords += outcome.recordCount;
            report.totalArchived += outcome.archivedCount;
            report.totalAnonymized += outcome.anonymizedCount;
            report.totalDeleted += outcome.deletedCount;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          report.errors.push({ entityType, tenantId, message });
          this.logger.error(
            `RetentionEnforcementJob: error processing entityType=${entityType} tenant=${tenantId ?? 'global'}: ${message}`,
          );
        }
      }
    }

    report.finishedAt = new Date();
    this.logger.log(
      `RetentionEnforcementJob: finished run (dryRun=${dryRun}) — ` +
        `records=${report.totalRecords}, archived=${report.totalArchived}, anonymized=${report.totalAnonymized}, deleted=${report.totalDeleted}, errors=${report.errors.length}`,
    );

    return report;
  }

  /**
   * Process a single (entityType, tenantId) pair: resolve the effective
   * policy, find expired rows, and process them in batches of policy.batchSize.
   * Returns undefined if there is nothing to report (tenant-scoped pass, an
   * active legal hold, or no expired rows).
   */
  private async processEntityTypeForTenant(
    entityType: RetentionEntityType,
    tenantId: string | null,
    dryRun: boolean,
  ): Promise<BatchOutcome | undefined> {
    // Neither Record nor AuditLogEntity carries a tenantId column today, so
    // tenant-scoped passes are skipped to avoid double-processing the same
    // global rows under every registered tenant override.
    if (tenantId) {
      return undefined;
    }

    // The global pass has to honour every tenant's rules at once, since the
    // rows cannot be attributed to a tenant: longest retention wins, and any hold blocks the pass.
    const policy = this.policyRegistry.getLongestPolicy(entityType);
    if (policy.legalHold) {
      this.logger.warn(
        `RetentionEnforcementJob: skipping entityType=${entityType} under policy ${policy.id} — legal hold active`,
      );
      return undefined;
    }
    this.assertActionSupported(entityType, policy.action);

    const cutoff = this.policyRegistry.getCutoffDate(policy);
    const batchSize = policy.batchSize ?? 500;

    let recordCount = 0;
    let archivedCount = 0;
    let anonymizedCount = 0;
    let deletedCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await this.fetchExpiredBatch(entityType, cutoff, batchSize, policy.action);
      if (batch.length === 0) break;

      recordCount += batch.length;

      if (!dryRun) {
        const applied = await this.applyAction(entityType, policy, batch);
        archivedCount += applied.archived;
        anonymizedCount += applied.anonymized;
        deletedCount += applied.deleted;

        await this.emitBatchEvent(policy, entityType, tenantId, batch.length, applied, dryRun, cutoff);
      }

      // In dry-run mode we still want to report what *would* happen, but we
      // must not loop forever re-fetching the same "expired" rows since
      // nothing was changed. A single pass is sufficient for the report.
      if (dryRun) break;

      // If the batch was smaller than batchSize, there's nothing left to fetch.
      if (batch.length < batchSize) break;
    }

    if (dryRun && recordCount > 0) {
      // Dry-run emits no mutating event, but we still surface the report via
      // the returned BatchOutcome so callers (and tests) can assert on it.
      this.logger.log(
        `RetentionEnforcementJob: [dry-run] ${recordCount} ${entityType} record(s) would be ${policy.action} under policy ${policy.id}`,
      );
    }

    if (recordCount === 0) {
      return undefined;
    }

    return {
      policyId: policy.id,
      entityType,
      tenantId,
      action: policy.action,
      recordCount,
      archivedCount,
      anonymizedCount,
      deletedCount,
      dryRun,
      cutoffDate: cutoff,
    };
  }

  /** Rejects policy actions that have no implementation for the entity type. */
  private assertActionSupported(entityType: RetentionEntityType, action: RetentionAction): void {
    if (entityType !== 'medical_records' && action !== 'archive_and_delete') {
      throw new Error(`retention action '${action}' is not supported for entityType=${entityType}`);
    }
  }

  private async fetchExpiredBatch(
    entityType: RetentionEntityType,
    cutoff: Date,
    batchSize: number,
    action: RetentionAction,
  ): Promise<RetentionRecordRef[]> {
    switch (entityType) {
      case 'medical_records': {
        // Rows already anonymised or soft-deleted by a previous batch still match
        // the cutoff, so exclude them here or the loop would refetch them forever.
        const where: FindOptionsWhere<MedicalRecord> = { createdAt: LessThan(cutoff) };
        if (action === 'anonymize') {
          where.patientId = Not(Like(ANONYMIZED_LIKE_PATTERN));
        }
        if (action === 'soft_delete') {
          where.isDeleted = false;
        }

        const rows = await this.recordRepo.find({
          where,
          take: batchSize,
          order: { createdAt: 'ASC' },
        });
        return rows.map((row) => ({
          id: row.id,
          tenantId: null,
          createdAt: row.createdAt,
          payload: { ...row },
        }));
      }
      case 'audit_logs': {
        const rows = await this.auditLogRepo.find({
          where: { createdAt: LessThan(cutoff) },
          take: batchSize,
          order: { createdAt: 'ASC' },
        });
        return rows.map((row) => ({
          id: row.id,
          tenantId: null,
          createdAt: row.createdAt,
          payload: { ...row },
        }));
      }
      default:
        return [];
    }
  }

  /** Applies the policy action to one batch and reports how many rows each effect touched. */
  private async applyAction(
    entityType: RetentionEntityType,
    policy: RetentionPolicy,
    batch: RetentionRecordRef[],
  ): Promise<{ archived: number; anonymized: number; deleted: number }> {
    const ids = batch.map((r) => r.id);

    switch (policy.action) {
      case 'anonymize': {
        // Anonymised rows stay in place and are deliberately not copied to the
        // archive: the archive holds the full payload, which would keep the PHI being removed.
        const anonymized = await this.anonymizeRecords(ids);
        return { archived: 0, anonymized, deleted: 0 };
      }
      case 'soft_delete': {
        const deleted = await this.softDeleteRecords(ids);
        return { archived: 0, anonymized: 0, deleted };
      }
      case 'archive_and_delete': {
        const archived = await this.archiveService.archiveBatch(entityType, policy.id, batch);
        const deleted = await this.deleteBatch(entityType, ids);
        return { archived, anonymized: 0, deleted };
      }
    }
  }

  /** Strips identifying fields from medical records, keeping the row and its anchor (stellarTxHash). */
  private async anonymizeRecords(ids: string[]): Promise<number> {
    for (const id of ids) {
      await this.recordRepo.update(id, {
        patientId: `${ANONYMIZED_PREFIX}${id}`,
        providerId: null,
        description: null,
        cid: '',
      });
    }
    return ids.length;
  }

  private async softDeleteRecords(ids: string[]): Promise<number> {
    const result = await this.recordRepo.update(ids, { isDeleted: true });
    return result.affected ?? ids.length;
  }

  private async deleteBatch(entityType: RetentionEntityType, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    switch (entityType) {
      case 'medical_records': {
        const result = await this.recordRepo.delete(ids);
        return result.affected ?? ids.length;
      }
      case 'audit_logs': {
        const result = await this.auditLogRepo.delete(ids);
        return result.affected ?? ids.length;
      }
      default:
        return 0;
    }
  }

  /** Emit one observability event per processed batch via the event store. */
  private async emitBatchEvent(
    policy: RetentionPolicy,
    entityType: RetentionEntityType,
    tenantId: string | null,
    recordCount: number,
    applied: { archived: number; anonymized: number; deleted: number },
    dryRun: boolean,
    cutoff: Date,
  ): Promise<void> {
    const aggregateId = `retention-${policy.id}-${tenantId ?? 'global'}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const event = new RetentionBatchProcessed(aggregateId, {
      policyId: policy.id,
      entityType,
      tenantId,
      action: policy.action,
      recordCount,
      archivedCount: applied.archived,
      anonymizedCount: applied.anonymized,
      deletedCount: applied.deleted,
      dryRun,
      cutoffDate: cutoff.toISOString(),
    });

    // Each batch event starts a brand new aggregate stream (expectedVersion 0)
    // so concurrent batches never collide on optimistic-concurrency checks.
    await this.eventStore.append(aggregateId, [event], 0);
  }
}
