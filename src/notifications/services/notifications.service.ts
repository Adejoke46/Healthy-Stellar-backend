import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphqlPubSubService } from '../../pubsub/services/graphql-pubsub.service';
import {
  NotificationEvent,
  NotificationEventType,
} from '../interfaces/notification-event.interface';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationPreferenceCenterService } from './notification-preference-center.service';
import { NotificationChannel } from '../entities/notification-category-preference.entity';
import { PushNotificationService } from './push-notification.service';

export const MAILER_SERVICE = 'MAILER_SERVICE';
export const SMS_DELIVERY_SERVICE = 'SMS_DELIVERY_SERVICE';

export interface SmsDeliveryService {
  sendSms(to: string, message: string): Promise<void>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly emailEnabled: boolean;

  constructor(
    private readonly graphqlPubSubService: GraphqlPubSubService,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly configService: ConfigService,
    private readonly templateService: NotificationTemplateService,
    @Optional() @Inject(MAILER_SERVICE) private readonly mailerService?: any,
    @Optional() private readonly preferenceCenter?: NotificationPreferenceCenterService,
    @Optional() @Inject(SMS_DELIVERY_SERVICE)
    private readonly smsDeliveryService?: SmsDeliveryService,
    @Optional() private readonly pushNotificationService?: PushNotificationService,
  ) {
    this.emailEnabled =
      this.configService.get<string>('ENABLE_EMAIL_NOTIFICATIONS', 'false') === 'true';
  }

  emitRecordAccessed(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.RECORD_ACCESSED,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitAccessGranted(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.ACCESS_GRANTED,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitAccessRevoked(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.ACCESS_REVOKED,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitRecordUploaded(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.RECORD_UPLOADED,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitEmergencyAccess(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.EMERGENCY_ACCESS,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitRecordAmended(actorId: string, resourceId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.RECORD_AMENDED,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitDiagnosisCreated(actorId: string, diagnosisId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.DIAGNOSIS_CREATED,
      actorId,
      resourceId: diagnosisId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitDiagnosisSeverityEscalated(actorId: string, diagnosisId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.DIAGNOSIS_SEVERITY_ESCALATED,
      actorId,
      resourceId: diagnosisId,
      timestamp: new Date(),
      metadata,
    });
  }

  emitDiagnosisStatusConfirmed(actorId: string, diagnosisId: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.DIAGNOSIS_STATUS_CONFIRMED,
      actorId,
      resourceId: diagnosisId,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Emit a proactive quota warning when a tenant crosses a usage threshold
   * (Issue #954).
   */
  emitQuotaWarning(tenantId: string, quotaType: string, metadata?: Record<string, any>): void {
    this.emitEvent({
      eventType: NotificationEventType.QUOTA_WARNING,
      actorId: tenantId,
      resourceId: quotaType,
      timestamp: new Date(),
      metadata,
    });
  }

  async notifyOnChainEvent(
    eventType: NotificationEventType,
    actorId: string,
    resourceId: string,
    patientId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: NotificationEvent = {
      eventType,
      actorId,
      resourceId,
      timestamp: new Date(),
      metadata: { ...metadata, targetUserId: patientId },
    };

    const preferenceKey = this.eventTypeToPreferenceKey(eventType);
    const category = this.eventTypeToCategory(eventType);

    const legacyRealtimeEnabled = preferenceKey
      ? await this.preferencesService.isChannelEnabled(patientId, 'webSocket', preferenceKey)
      : true;
    const categoryRealtimeEnabled = category
      ? await this.isCategoryChannelEnabled(patientId, category, NotificationChannel.WEBSOCKET)
      : true;

    if (legacyRealtimeEnabled && categoryRealtimeEnabled) {
      await this.publishRealtimeEvent(event);
    }

    if (this.emailEnabled && preferenceKey) {
      const legacyEmailEnabled = await this.preferencesService.isChannelEnabled(
        patientId,
        'email',
        preferenceKey,
      );
      const categoryEmailEnabled = category
        ? await this.isCategoryChannelEnabled(patientId, category, NotificationChannel.EMAIL)
        : true;

      if (legacyEmailEnabled && categoryEmailEnabled) {
        await this.sendEmailNotification(event, patientId);
      }
    }
  }

  resolveLocalizedNotification(
    eventType: NotificationEventType,
    preferredLanguage: string,
    args: Record<string, any> = {},
  ) {
    return this.templateService.resolve(eventType, preferredLanguage, args);
  }

  async sendPatientEmailNotification(
    patientId: string,
    subject: string,
    message: string,
    preferredLanguage = 'en',
  ): Promise<void> {
    this.logger.log(
      `Email notification queued for patient ${patientId} [lang=${preferredLanguage}]: ${subject} - ${message}`,
    );
  }

  async sendProviderEmailNotification(
    providerId: string,
    subject: string,
    message: string,
    preferredLanguage = 'en',
  ): Promise<void> {
    this.logger.log(
      `Email notification queued for provider ${providerId} [lang=${preferredLanguage}]: ${subject} - ${message}`,
    );
  }

  async sendEmail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, any>,
  ): Promise<void> {
    if (!this.emailEnabled || !this.mailerService) {
      this.logger.log(`[Mock Email] Sent to ${to}: ${subject}`);
      return;
    }
    await this.mailerService.sendMail({ to, subject, template, context });
  }

  async sendReminderEmail(to: string, subject: string, message: string): Promise<void> {
    if (!this.emailEnabled || !this.mailerService) {
      throw new ServiceUnavailableException('Appointment reminder email delivery is not configured');
    }
    await this.mailerService.sendMail({ to, subject, text: message });
  }

  async sendReminderSms(to: string, message: string): Promise<void> {
    if (!this.smsDeliveryService) {
      throw new ServiceUnavailableException('SMS delivery provider is not configured');
    }
    await this.smsDeliveryService.sendSms(to, message);
  }

  async sendReminderPush(recipient: string, title: string, message: string): Promise<void> {
    if (!this.pushNotificationService) {
      throw new ServiceUnavailableException('Push notification delivery is not configured');
    }
    await this.pushNotificationService.sendToRegisteredDevices(recipient, {
      title,
      body: message,
    });
  }

  private emitEvent(event: NotificationEvent): void {
    this.publishRealtimeEvent(event).catch((error: any) => {
      this.logger.warn(`Failed to publish realtime event ${event.eventType}: ${error?.message}`);
    });
  }

  private async publishRealtimeEvent(event: NotificationEvent): Promise<void> {
    const patientId = this.resolvePatientId(event.actorId, event.metadata);
    const timestamp = event.timestamp.toISOString();

    switch (event.eventType) {
      case NotificationEventType.RECORD_ACCESSED:
        await this.graphqlPubSubService.publishRecordAccessed(patientId, {
          patientId,
          actorId: event.actorId,
          recordId: event.resourceId,
          timestamp,
        });
        return;
      case NotificationEventType.ACCESS_GRANTED:
        await this.graphqlPubSubService.publishAccessGranted(patientId, {
          patientId,
          actorId: event.actorId,
          grantId: event.resourceId,
          granteeId: event.metadata?.granteeId,
          timestamp,
        });
        return;
      case NotificationEventType.ACCESS_REVOKED:
        await this.graphqlPubSubService.publishAccessRevoked(patientId, {
          patientId,
          actorId: event.actorId,
          grantId: event.resourceId,
          reason: event.metadata?.revocationReason,
          timestamp,
        });
        return;
      case NotificationEventType.RECORD_UPLOADED:
        await this.graphqlPubSubService.publishRecordUploaded(patientId, {
          patientId,
          actorId: event.actorId,
          recordId: event.resourceId,
          timestamp,
        });
        return;
      case NotificationEventType.QUOTA_WARNING:
        // Quota warnings are recorded in the tenant-quota near-limit registry;
        // surface them here for realtime/ops visibility.
        this.logger.warn(
          `Quota warning for tenant ${event.actorId} (${event.resourceId}): ` +
            `${JSON.stringify(event.metadata ?? {})}`,
        );
        return;
      default:
        return;
    }
  }

  private resolvePatientId(actorId: string, metadata?: Record<string, any>): string {
    return metadata?.targetUserId ?? metadata?.patientId ?? actorId;
  }

  private async sendEmailNotification(
    event: NotificationEvent,
    patientId: string,
  ): Promise<void> {
    if (!this.mailerService) {
      this.logger.debug(`Email skipped (no mailer): ${event.eventType} for patient ${patientId}`);
      return;
    }

    try {
      await this.mailerService.sendMail({
        to: patientId,
        subject: this.buildEmailSubject(event.eventType),
        template: this.eventTypeToTemplate(event.eventType),
        context: {
          eventType: event.eventType,
          actorId: event.actorId,
          resourceId: event.resourceId,
          timestamp: event.timestamp,
          ...event.metadata,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to send email for ${event.eventType}: ${error?.message}`);
    }
  }

  private eventTypeToCategory(eventType: NotificationEventType): string | null {
    switch (eventType) {
      case NotificationEventType.RECORD_UPLOADED:
        return 'new_record';
      case NotificationEventType.ACCESS_GRANTED:
        return 'access_granted';
      case NotificationEventType.ACCESS_REVOKED:
        return 'access_revoked';
      default:
        return null;
    }
  }

  private async isCategoryChannelEnabled(
    userId: string,
    category: string,
    channel: NotificationChannel,
  ): Promise<boolean> {
    if (!this.preferenceCenter) {
      return true;
    }
    return this.preferenceCenter.isChannelEnabledForCategory(userId, category, channel);
  }

  private eventTypeToPreferenceKey(
    eventType: NotificationEventType,
  ): 'newRecord' | 'accessGranted' | 'accessRevoked' | null {
    switch (eventType) {
      case NotificationEventType.RECORD_UPLOADED:
        return 'newRecord';
      case NotificationEventType.ACCESS_GRANTED:
        return 'accessGranted';
      case NotificationEventType.ACCESS_REVOKED:
        return 'accessRevoked';
      default:
        return null;
    }
  }

  private buildEmailSubject(eventType: NotificationEventType): string {
    const subjects: Partial<Record<NotificationEventType, string>> = {
      [NotificationEventType.RECORD_UPLOADED]: 'New medical record added to your account',
      [NotificationEventType.ACCESS_GRANTED]: 'Access to your records has been granted',
      [NotificationEventType.ACCESS_REVOKED]: 'Access to your records has been revoked',
    };
    return subjects[eventType] ?? 'Health record notification';
  }

  private eventTypeToTemplate(eventType: NotificationEventType): string {
    const templates: Partial<Record<NotificationEventType, string>> = {
      [NotificationEventType.RECORD_UPLOADED]: 'record-uploaded',
      [NotificationEventType.ACCESS_GRANTED]: 'access-granted',
      [NotificationEventType.ACCESS_REVOKED]: 'access-revoked',
    };
    return templates[eventType] ?? 'generic-notification';
  }
}
