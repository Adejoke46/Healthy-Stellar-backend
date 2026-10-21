import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MedicalRecord } from '../medical-records/entities/medical-record.entity';
import { MedicalRecordVersion } from '../medical-records/entities/medical-record-version.entity';
import { AccessGrant } from '../access-control/entities/access-grant.entity';
import { User } from '../auth/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { StellarTransaction } from '../analytics/entities/stellar-transaction.entity';
import { ConsistencyIncident, IncidentSeverity, IncidentStatus } from './consistency-incident.entity';
import { FeatureFlagService } from '../feature-flags/feature-flag.service';

export interface DriftResult {
  table: string;
  sourceCount: number;
  readModelCount: number;
  drift: number;
  checksumMatch: boolean;
  detectedAt: Date;
}

export interface ConsistencyReport {
  healthy: boolean;
  drifts: DriftResult[];
  checkedAt: Date;
}

/** Feature-flag keys that individually enable/disable each check */
const FLAG = {
  LAB_RESULTS: 'consistency.check.lab_results_without_patient',
  PRESCRIPTIONS: 'consistency.check.prescriptions_without_provider',
  STELLAR_BILLING: 'consistency.check.stellar_without_billing',
  MEDICAL_RECORD_VERSIONS: 'consistency.check.medical_record_versions',
  ORPHANED_VERSIONS: 'consistency.check.orphaned_versions',
  ACCESS_GRANTS: 'consistency.check.access_grants_patient',
  USER_PATIENT: 'consistency.check.user_patient',
};

@Injectable()
export class ConsistencyCheckerService {
  private readonly logger = new Logger(ConsistencyCheckerService.name);
  private lastReport: ConsistencyReport | null = null;

  constructor(
    @InjectRepository(MedicalRecord)
    private readonly medicalRecordRepo: Repository<MedicalRecord>,
    @InjectRepository(MedicalRecordVersion)
    private readonly versionRepo: Repository<MedicalRecordVersion>,
    @InjectRepository(AccessGrant)
    private readonly accessGrantRepo: Repository<AccessGrant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(StellarTransaction)
    private readonly stellarTxRepo: Repository<StellarTransaction>,
    @InjectRepository(ConsistencyIncident)
    private readonly incidentRepo: Repository<ConsistencyIncident>,
    private readonly dataSource: DataSource,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async runFullCheck(): Promise<ConsistencyReport> {
    const checks: Array<() => Promise<DriftResult[]>> = [
      () => this.runIfEnabled(FLAG.MEDICAL_RECORD_VERSIONS, () => this.checkMedicalRecordVersionDrift()),
      () => this.runIfEnabled(FLAG.ORPHANED_VERSIONS, () => this.checkOrphanedVersions()),
      () => this.runIfEnabled(FLAG.ACCESS_GRANTS, () => this.checkAccessGrantPatientDrift()),
      () => this.runIfEnabled(FLAG.STELLAR_BILLING, () => this.checkStellarTxRecordDrift()),
      () => this.runIfEnabled(FLAG.USER_PATIENT, () => this.checkUserPatientDrift()),
      () => this.runIfEnabled(FLAG.LAB_RESULTS, () => this.checkLabResultsWithoutPatient()),
      () => this.runIfEnabled(FLAG.PRESCRIPTIONS, () => this.checkPrescriptionsWithoutProvider()),
    ];

    const settled = await Promise.allSettled(checks.map((fn) => fn()));

    const drifts: DriftResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        drifts.push(...result.value);
      } else {
        this.logger.error(`Consistency check failed: ${result.reason}`);
      }
    }

    // Persist failures as incidents and alert ops
    if (drifts.length > 0) {
      await this.persistIncidents(drifts);
      this.logger.error(
        `[ConsistencyChecker] ${drifts.length} integrity issue(s) detected — incidents recorded`,
      );
      drifts.forEach((d) =>
        this.logger.warn(
          `[DRIFT] ${d.table} — source=${d.sourceCount} readModel=${d.readModelCount} delta=${d.drift}`,
        ),
      );
    } else {
      // Auto-resolve previously open incidents for all checks since no drift was found
      await this.autoResolveIncidents();
      this.logger.log('Consistency check passed — no integrity issues detected');
    }

    this.lastReport = { healthy: drifts.length === 0, drifts, checkedAt: new Date() };
    return this.lastReport;
  }

  /** Most recent report from any run (manual or scheduled), or null if none yet */
  getLastReport(): ConsistencyReport | null {
    return this.lastReport;
  }

  async listOpenIncidents(): Promise<ConsistencyIncident[]> {
    return this.incidentRepo.find({
      where: { status: IncidentStatus.OPEN },
      order: { createdAt: 'DESC' },
    });
  }

  async resolveIncident(incidentId: string, resolvedBy: string, reason?: string): Promise<ConsistencyIncident> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    incident.status = IncidentStatus.RESOLVED;
    incident.resolvedAt = new Date();
    incident.resolvedBy = resolvedBy;
    incident.resolutionReason = reason || null;

    const saved = await this.incidentRepo.save(incident);
    this.logger.log(`Incident ${incidentId} manually resolved by ${resolvedBy}`);
    return saved;
  }

  // ── Individual checks ──────────────────────────────────────────────────────

  /** Active medical_records must each have ≥1 version row. */
  private async checkMedicalRecordVersionDrift(): Promise<DriftResult[]> {
    const [src] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count FROM medical_records WHERE status != 'deleted'`,
    );
    const [rm] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(DISTINCT "medicalRecordId") AS count FROM medical_record_versions`,
    );
    const source = parseInt(src.count, 10);
    const readModel = parseInt(rm.count, 10);
    const drift = source - readModel;
    if (drift === 0) return [];
    return [this.buildResult('medical_records → medical_record_versions', source, readModel, drift)];
  }

  /** Version rows whose parent record no longer exists. */
  private async checkOrphanedVersions(): Promise<DriftResult[]> {
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM medical_record_versions v
       LEFT JOIN medical_records r ON r.id = v."medicalRecordId"
       WHERE r.id IS NULL`,
    );
    const orphans = parseInt(res.count, 10);
    if (orphans === 0) return [];
    return [this.buildResult('medical_record_versions (orphaned)', 0, orphans, orphans)];
  }

  /** access_grants.patientId must reference an existing patient. */
  private async checkAccessGrantPatientDrift(): Promise<DriftResult[]> {
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM access_grants ag
       LEFT JOIN patients p ON p.id = ag."patientId"
       WHERE p.id IS NULL`,
    );
    const dangling = parseInt(res.count, 10);
    if (dangling === 0) return [];
    return [this.buildResult('access_grants → patients (dangling patientId)', 0, dangling, dangling)];
  }

  /** stellar_transactions for medical_record type must reference existing records. */
  private async checkStellarTxRecordDrift(): Promise<DriftResult[]> {
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM stellar_transactions st
       LEFT JOIN medical_records mr ON mr.id = st."relatedEntityId"
       WHERE st."relatedEntityType" = 'medical_record'
         AND mr.id IS NULL`,
    );
    const dangling = parseInt(res.count, 10);
    if (dangling === 0) return [];
    return [this.buildResult('stellar_transactions → medical_records (dangling)', 0, dangling, dangling)];
  }

  /** Patients without a linked user account. */
  private async checkUserPatientDrift(): Promise<DriftResult[]> {
    const [patientCount, userCount] = await Promise.all([
      this.patientRepo.count(),
      this.userRepo.count(),
    ]);
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM patients p
       LEFT JOIN users u ON u."patientProfileId" = p.id
       WHERE u.id IS NULL`,
    );
    const unlinked = parseInt(res.count, 10);
    if (unlinked === 0) return [];
    return [this.buildResult('patients → users (unlinked)', patientCount, userCount, unlinked)];
  }

  /** Lab results referencing a deleted/non-existent patient. */
  private async checkLabResultsWithoutPatient(): Promise<DriftResult[]> {
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM lab_results lr
       JOIN lab_orders lo ON lo.id = lr."orderId"
       LEFT JOIN patients p ON p.id = lo."patientId"
       WHERE p.id IS NULL`,
    );
    const orphans = parseInt(res.count, 10);
    if (orphans === 0) return [];
    return [
      this.buildResult('lab_results → patients (no valid patient)', 0, orphans, orphans, IncidentSeverity.HIGH),
    ];
  }

  /** Prescriptions without an ordering provider. */
  private async checkPrescriptionsWithoutProvider(): Promise<DriftResult[]> {
    const [res] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM prescriptions pr
       LEFT JOIN doctors d ON d.id = pr."doctorId"
       WHERE d.id IS NULL`,
    );
    const orphans = parseInt(res.count, 10);
    if (orphans === 0) return [];
    return [
      this.buildResult('prescriptions → doctors (no ordering provider)', 0, orphans, orphans, IncidentSeverity.HIGH),
    ];
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async runIfEnabled(
    flagKey: string,
    check: () => Promise<DriftResult[]>,
  ): Promise<DriftResult[]> {
    const enabled = await this.featureFlags.isEnabled(flagKey).catch(() => true);
    if (!enabled) return [];
    return check();
  }

  private async persistIncidents(drifts: DriftResult[]): Promise<void> {
    for (const drift of drifts) {
      // Try to find an existing OPEN incident for this checkName
      const existing = await this.incidentRepo.findOne({
        where: {
          checkName: drift.table,
          status: IncidentStatus.OPEN,
        },
      });

      const incident = existing || this.incidentRepo.create();
      incident.checkName = drift.table;
      incident.description = `source=${drift.sourceCount} readModel=${drift.readModelCount} drift=${drift.drift}`;
      incident.severity = (drift as any).severity ?? IncidentSeverity.MEDIUM;
      incident.status = IncidentStatus.OPEN;
      incident.affectedCount = drift.drift;

      await this.incidentRepo.save(incident).catch((err) =>
        this.logger.error(`Failed to upsert consistency incident for ${drift.table}: ${err.message}`),
      );
    }
  }

  private async autoResolveIncidents(): Promise<void> {
    const openIncidents = await this.incidentRepo.find({
      where: { status: IncidentStatus.OPEN },
    });

    for (const incident of openIncidents) {
      incident.status = IncidentStatus.RESOLVED;
      incident.resolvedAt = new Date();
      incident.resolvedBy = 'system';
      incident.resolutionReason = 'Auto-resolved: drift resolved in subsequent check run';

      await this.incidentRepo.save(incident).catch((err) =>
        this.logger.error(`Failed to auto-resolve incident ${incident.id}: ${err.message}`),
      );
    }

    if (openIncidents.length > 0) {
      this.logger.log(`Auto-resolved ${openIncidents.length} open incident(s)`);
    }
  }

  private buildResult(
    table: string,
    sourceCount: number,
    readModelCount: number,
    drift: number,
    severity = IncidentSeverity.MEDIUM,
  ): DriftResult & { severity: IncidentSeverity } {
    return { table, sourceCount, readModelCount, drift, checksumMatch: false, detectedAt: new Date(), severity };
  }
}
