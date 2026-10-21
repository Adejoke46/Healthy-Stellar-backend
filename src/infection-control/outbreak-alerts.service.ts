import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/services/notifications.service';
import { InfectionCase, InfectionStatus } from './entities/infection-case.entity';
import { OutbreakThreshold } from './entities/outbreak-threshold.entity';
import { OutbreakAlert, OutbreakAlertStatus } from './entities/outbreak-alert.entity';
import { CreateOutbreakThresholdDto } from './dto/create-outbreak-threshold.dto';
import { UpdateOutbreakThresholdDto } from './dto/update-outbreak-threshold.dto';

export interface ThresholdEvaluationResult {
  threshold: OutbreakThreshold;
  observedCount: number;
  alertCreated: OutbreakAlert | null;
  skippedReason?: 'below_threshold' | 'already_active' | 'resolved_no_new_cases';
}

// Only live cases count toward an outbreak; RESOLVED and DECEASED cases do not.
const COUNTED_CASE_STATUSES = [InfectionStatus.ACTIVE, InfectionStatus.CONFIRMED];

/**
 * Configures per-pathogen/per-ward outbreak thresholds, evaluates them on a
 * schedule against recent InfectionCase volume, and raises deduplicated
 * OutbreakAlert records with in-app + email delivery.
 */
@Injectable()
export class OutbreakAlertsService {
  private readonly logger = new Logger(OutbreakAlertsService.name);

  constructor(
    @InjectRepository(OutbreakThreshold)
    private readonly thresholdRepository: Repository<OutbreakThreshold>,
    @InjectRepository(OutbreakAlert)
    private readonly alertRepository: Repository<OutbreakAlert>,
    @InjectRepository(InfectionCase)
    private readonly infectionCaseRepository: Repository<InfectionCase>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---- Threshold configuration ----

  async createThreshold(dto: CreateOutbreakThresholdDto): Promise<OutbreakThreshold> {
    const threshold = this.thresholdRepository.create({
      ...dto,
      windowMinutes: dto.windowMinutes ?? 1440,
      isActive: dto.isActive ?? true,
      notifyEmails: dto.notifyEmails ?? null,
      notifyUserIds: dto.notifyUserIds ?? null,
    });
    return this.thresholdRepository.save(threshold);
  }

  async findAllThresholds(): Promise<OutbreakThreshold[]> {
    return this.thresholdRepository.find();
  }

  async findOneThreshold(id: string): Promise<OutbreakThreshold> {
    const threshold = await this.thresholdRepository.findOne({ where: { id } });
    if (!threshold) {
      throw new NotFoundException(`Outbreak threshold with ID ${id} not found`);
    }
    return threshold;
  }

  async updateThreshold(
    id: string,
    dto: UpdateOutbreakThresholdDto,
  ): Promise<OutbreakThreshold> {
    await this.thresholdRepository.update(id, dto);
    return this.findOneThreshold(id);
  }

  // ---- Alert dashboard ----

  async findActiveAlerts(): Promise<OutbreakAlert[]> {
    return this.alertRepository.find({
      where: { status: OutbreakAlertStatus.ACTIVE },
      order: { triggeredAt: 'DESC' },
    });
  }

  async resolveAlert(id: string): Promise<OutbreakAlert> {
    const alert = await this.alertRepository.findOne({ where: { id } });
    if (!alert) {
      throw new NotFoundException(`Outbreak alert with ID ${id} not found`);
    }
    alert.status = OutbreakAlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    return this.alertRepository.save(alert);
  }

  // ---- Threshold evaluation (invoked by the scheduled job) ----

  /**
   * Evaluates every active threshold: counts ACTIVE/CONFIRMED InfectionCase rows
   * for the threshold's pathogen+location within the trailing `windowMinutes`,
   * and raises an alert if the count meets/exceeds the threshold AND no alert is
   * already ACTIVE for that pathogen+location (deduplication). After a resolution,
   * no new alert is raised until at least one new case is recorded after the
   * resolved alert's `resolvedAt`.
   */
  async evaluateAllThresholds(): Promise<ThresholdEvaluationResult[]> {
    const thresholds = await this.thresholdRepository.find({ where: { isActive: true } });
    const results: ThresholdEvaluationResult[] = [];

    for (const threshold of thresholds) {
      results.push(await this.evaluateThreshold(threshold));
    }

    return results;
  }

  async evaluateThreshold(threshold: OutbreakThreshold): Promise<ThresholdEvaluationResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - threshold.windowMinutes * 60 * 1000);

    const observedCount = await this.infectionCaseRepository.count({
      where: {
        pathogen: threshold.pathogen,
        location: threshold.location,
        status: In(COUNTED_CASE_STATUSES),
        detectionDate: MoreThanOrEqual(windowStart),
      },
    });

    if (observedCount < threshold.thresholdCount) {
      return { threshold, observedCount, alertCreated: null, skippedReason: 'below_threshold' };
    }

    const existingActiveAlert = await this.alertRepository.findOne({
      where: {
        pathogen: threshold.pathogen,
        location: threshold.location,
        status: OutbreakAlertStatus.ACTIVE,
      },
    });

    if (existingActiveAlert) {
      return { threshold, observedCount, alertCreated: null, skippedReason: 'already_active' };
    }

    // The windowed count can stay above threshold after an officer resolves an
    // alert, so hold off until new cases are recorded after the resolution.
    const lastResolvedAlert = await this.alertRepository.findOne({
      where: {
        pathogen: threshold.pathogen,
        location: threshold.location,
        status: OutbreakAlertStatus.RESOLVED,
      },
      order: { resolvedAt: 'DESC' },
    });

    if (lastResolvedAlert?.resolvedAt) {
      const newCasesSinceResolution = await this.infectionCaseRepository.count({
        where: {
          pathogen: threshold.pathogen,
          location: threshold.location,
          status: In(COUNTED_CASE_STATUSES),
          createdAt: MoreThan(lastResolvedAlert.resolvedAt),
        },
      });

      if (newCasesSinceResolution === 0) {
        return {
          threshold,
          observedCount,
          alertCreated: null,
          skippedReason: 'resolved_no_new_cases',
        };
      }
    }

    const alert = await this.alertRepository.save(
      this.alertRepository.create({
        thresholdId: threshold.id,
        pathogen: threshold.pathogen,
        location: threshold.location,
        thresholdCount: threshold.thresholdCount,
        observedCount,
        windowMinutes: threshold.windowMinutes,
        windowStart,
        triggeredAt: now,
        status: OutbreakAlertStatus.ACTIVE,
      }),
    );

    await this.deliverAlertNotifications(alert, threshold);

    return { threshold, observedCount, alertCreated: alert };
  }

  // ---- Notification delivery ----

  private async deliverAlertNotifications(
    alert: OutbreakAlert,
    threshold: OutbreakThreshold,
  ): Promise<void> {
    const subject = `Outbreak alert: ${alert.pathogen} threshold exceeded in ${alert.location}`;
    const message =
      `${alert.observedCount} confirmed/active ${alert.pathogen} case(s) detected in ` +
      `${alert.location} within the last ${alert.windowMinutes} minute(s), meeting or exceeding ` +
      `the configured threshold of ${alert.thresholdCount}. Outbreak alert ${alert.id} raised.`;

    // In-app delivery: the alert row itself is the in-app surface, exposed via
    // the dashboard endpoint (GET /infection-control/outbreak-alerts). We also
    // route it through NotificationsService for each configured user so it is
    // logged/queued the same way other in-app notifications are.
    try {
      const recipients = threshold.notifyUserIds ?? [];
      for (const userId of recipients) {
        await this.notificationsService.sendProviderEmailNotification(
          userId,
          subject,
          message,
        );
      }
      alert.inAppNotified = true;
    } catch (error: any) {
      this.logger.warn(`Failed to deliver in-app outbreak alert ${alert.id}: ${error?.message}`);
    }

    // Email delivery via the configured recipient list. There is no
    // infection-control-officer role/lookup in the codebase today, so
    // recipients are a pragmatic, explicit configuration on the threshold.
    try {
      const emails = threshold.notifyEmails ?? [];
      for (const email of emails) {
        await this.notificationsService.sendEmail(email, subject, 'outbreak-alert', {
          pathogen: alert.pathogen,
          location: alert.location,
          observedCount: alert.observedCount,
          thresholdCount: alert.thresholdCount,
          windowMinutes: alert.windowMinutes,
          triggeredAt: alert.triggeredAt,
          alertId: alert.id,
        });
      }
      alert.emailNotified = emails.length > 0;
    } catch (error: any) {
      this.logger.error(`Failed to email outbreak alert ${alert.id}: ${error?.message}`);
    }

    await this.alertRepository.save(alert);

    this.logger.warn(
      `Outbreak alert raised: pathogen=${alert.pathogen} location=${alert.location} ` +
        `observed=${alert.observedCount} threshold=${alert.thresholdCount}`,
    );
  }
}
