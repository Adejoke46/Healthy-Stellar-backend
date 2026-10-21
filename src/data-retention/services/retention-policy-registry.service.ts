import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_ENTITY_POLICIES,
  RetentionEntityType,
  RetentionPolicy,
  TenantRetentionOverride,
} from '../retention-policy.types';

/**
 * Resolves the effective retention policy for a given (entityType, tenantId)
 * pair, applying tenant-specific overrides on top of the global defaults.
 *
 * In production, overrides would typically be hydrated from a config table
 * (mirroring the pattern in TenantConfigService). For now they are registered
 * in-memory via `setTenantOverride`, consistent with the existing
 * DataRetentionService.setTenantPolicy approach.
 */
@Injectable()
export class RetentionPolicyRegistryService {
  private readonly logger = new Logger(RetentionPolicyRegistryService.name);

  private readonly tenantOverrides = new Map<string, TenantRetentionOverride>();

  /** Register or replace the retention overrides for a tenant. */
  setTenantOverride(override: TenantRetentionOverride): void {
    this.tenantOverrides.set(override.tenantId, override);
    this.logger.log(
      `Registered retention override for tenant=${override.tenantId}: ${Object.keys(override.policies).join(', ')}`,
    );
  }

  /** Remove a tenant's overrides (falls back fully to global defaults). */
  clearTenantOverride(tenantId: string): void {
    this.tenantOverrides.delete(tenantId);
  }

  /** All tenant IDs that currently have at least one override registered. */
  getOverriddenTenantIds(): string[] {
    return [...this.tenantOverrides.keys()];
  }

  /**
   * Resolve the effective policy for an entity type, applying the tenant
   * override (if any) on top of the global default. A tenant override may
   * specify only a subset of fields (e.g. just `retentionDays`); unspecified
   * fields fall back to the global default for that entity type.
   */
  getEffectivePolicy(entityType: RetentionEntityType, tenantId: string | null): RetentionPolicy {
    const base = DEFAULT_ENTITY_POLICIES[entityType];

    if (!tenantId) {
      return { ...base };
    }

    const override = this.tenantOverrides.get(tenantId)?.policies[entityType];
    if (!override) {
      return { ...base };
    }

    return {
      ...base,
      id: `${base.id}:tenant:${tenantId}`,
      retentionDays: override.retentionDays ?? base.retentionDays,
      action: override.action ?? base.action,
      batchSize: override.batchSize ?? base.batchSize,
      legalHold: override.legalHold ?? base.legalHold,
    };
  }

  /**
   * Resolve the policy the global (untenanted) pass must enforce when rows
   * carry no tenantId. That pass has to satisfy every tenant at once, so the
   * policy with the longest retention across the global default and all
   * overrides wins, and a legal hold on any of them holds the whole entity type.
   */
  getLongestPolicy(entityType: RetentionEntityType): RetentionPolicy {
    const candidates = [
      DEFAULT_ENTITY_POLICIES[entityType],
      ...this.getOverriddenTenantIds().map((tenantId) => this.getEffectivePolicy(entityType, tenantId)),
    ];
    const longest = candidates.reduce((a, b) => (b.retentionDays > a.retentionDays ? b : a));

    return { ...longest, legalHold: candidates.some((p) => p.legalHold) };
  }

  /** Compute the cutoff date (records created before this are expired) for a policy. */
  getCutoffDate(policy: RetentionPolicy, now: Date = new Date()): Date {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - policy.retentionDays);
    return cutoff;
  }
}
