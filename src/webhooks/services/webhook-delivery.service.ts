import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac } from 'crypto';
import { WebhookDelivery, WebhookDeliveryStatus } from '../entities/webhook-delivery.entity';
import { WebhookSubscription } from '../entities/webhook-subscription.entity';
import { QUEUE_NAMES, JOB_TYPES } from '../../queues/queue.constants';
import { AuditLogService } from '../../common/services/audit-log.service';
import { DlqService } from '../../dlq/dlq.service';

interface WebhookDeliveryJobData {
  deliveryId: string;
  subscriptionId: string;
  subscriptionUrl: string;
  eventType: string;
  eventPayload: Record<string, any>;
  subscriptionSecret?: string;
  customHeaders?: Record<string, string>;
  tenantId?: string | null;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    @InjectRepository(WebhookSubscription)
    private readonly subscriptionRepository: Repository<WebhookSubscription>,
    @Inject('QUEUE_WEBHOOK_DELIVERY')
    private readonly webhookQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditLogService,
    private readonly configService: ConfigService,
    private readonly dlqService: DlqService,
  ) {}

  private getRetryDelayMs(attemptNumber: number): number {
    const delaysSeconds = [1, 2, 4, 8, 16];
    return (delaysSeconds[Math.min(attemptNumber - 1, delaysSeconds.length - 1)] ?? 16) * 1000;
  }

  private getResponseBodySnippet(body: unknown): string | null {
    if (body === null || body === undefined) {
      return null;
    }

    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return text.length > 200 ? text.slice(0, 200) : text;
  }

  /**
   * Queue a webhook delivery for a healthcare event.
   * Called when an event (e.g., prescription issued, lab result) occurs.
   */
  async queueWebhookDeliveries(
    eventType: string,
    eventPayload: Record<string, any>,
    tenantId?: string | null,
  ): Promise<void> {
    try {
      // Find active subscriptions interested in this event type
      const subscriptions = await this.subscriptionRepository.find({
        select: {
          id: true,
          tenantId: true,
          url: true,
          events: true,
          secret: true,
          maxRetries: true,
          metadata: true,
        },
        where: {
          isActive: true,
          ...(tenantId ? { tenantId } : {}),
        },
      });

      const relevantSubs = subscriptions.filter((sub) => sub.events.includes(eventType));

      if (relevantSubs.length === 0) {
        this.logger.debug(`No active subscriptions for event: ${eventType}`);
        return;
      }

      // Create delivery record for each relevant subscription
      for (const subscription of relevantSubs) {
        const delivery = this.deliveryRepository.create({
          subscriptionId: subscription.id,
          eventType,
          eventPayload,
          tenantId: subscription.tenantId,
          status: WebhookDeliveryStatus.PENDING,
          maxAttempts: subscription.maxRetries,
        });

        const savedDelivery = await this.deliveryRepository.save(delivery);

        // Queue the delivery job
        await this.webhookQueue.add(
          JOB_TYPES.WEBHOOK_DELIVER,
          {
            deliveryId: savedDelivery.id,
            subscriptionId: subscription.id,
            subscriptionUrl: subscription.url,
            eventType,
            eventPayload,
            subscriptionSecret: subscription.secret,
            customHeaders: subscription.metadata.customHeaders as Record<string, string>,
            tenantId: subscription.tenantId,
          } as WebhookDeliveryJobData,
          {
            jobId: savedDelivery.id,
            attempts: Math.max(subscription.maxRetries, 1),
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: false, // Keep for audit trail
            removeOnFail: false,
          },
        );

        this.logger.log(
          `Queued webhook delivery: ${eventType} to ${subscription.url} (delivery: ${savedDelivery.id})`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to queue webhook deliveries for event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Attempt to deliver a webhook (called by processor).
   * Returns true on success, false on failure (for retry).
   */
  async deliverWebhook(job: Job<WebhookDeliveryJobData>): Promise<{ success: boolean }> {
    const data = job.data;
    const attemptNumber = job.attemptsMade + 1;

    try {
      const delivery = await this.deliveryRepository.findOne({
        where: { id: data.deliveryId },
        relations: ['subscription'],
      });

      if (!delivery) {
        throw new Error(`Delivery record not found: ${data.deliveryId}`);
      }

      // Update status to processing
      delivery.status = WebhookDeliveryStatus.PROCESSING;
      delivery.attemptCount = attemptNumber;
      await this.deliveryRepository.save(delivery);

      // Prepare request
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': data.eventType,
        'X-Webhook-Delivery': data.deliveryId,
        ...(data.customHeaders || {}),
      };

      // Add HMAC signature if secret provided
      const payload = JSON.stringify(data.eventPayload);
      if (data.subscriptionSecret) {
        const signature = createHmac('sha256', data.subscriptionSecret)
          .update(payload)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      // Perform HTTP POST to subscriber endpoint
      const startTime = Date.now();
      const response = await axios.post(data.subscriptionUrl, data.eventPayload, {
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => status < 500, // Don't throw on 4xx
      });

      const durationMs = Date.now() - startTime;

      // Success if 2xx status
      if (response.status >= 200 && response.status < 300) {
        delivery.status = WebhookDeliveryStatus.DELIVERED;
        delivery.lastHttpStatus = response.status;
        delivery.lastError = null;
        delivery.lastResponseBody = this.getResponseBodySnippet(response.data);
        delivery.deliveredAt = new Date();
        delivery.attempts.push({
          attemptNumber,
          timestamp: new Date().toISOString(),
          httpStatus: response.status,
          error: null,
          responseBodySnippet: this.getResponseBodySnippet(response.data),
          durationMs,
        });

        // Reset consecutive failures on success
        if (delivery.subscription) {
          delivery.subscription.consecutiveFailures = 0;
          delivery.subscription.lastSuccessAt = new Date();
          await this.subscriptionRepository.save(delivery.subscription);
        }

        await this.deliveryRepository.save(delivery);

        this.logger.log(
          `Webhook delivery succeeded: ${data.eventType} to ${data.subscriptionUrl} (${durationMs}ms)`,
        );

        // Emit audit event
        await this.auditService.log({
          entityType: 'WebhookDelivery',
          entityId: delivery.id,
          action: 'DELIVERED',
          userId: 'system',
          changes: { status: WebhookDeliveryStatus.DELIVERED },
          metadata: {
            eventType: data.eventType,
            subscriptionUrl: data.subscriptionUrl,
            httpStatus: response.status,
            durationMs,
          },
        });

        return { success: true };
      }

      // 4xx or 5xx error - attempt to recover
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} - ${JSON.stringify(response.data).substring(0, 200)}`,
      );
    } catch (error) {
      const deliveryId = data.deliveryId;
      const durationMs = 0;

      try {
        const delivery = await this.deliveryRepository.findOne({
          where: { id: deliveryId },
          relations: ['subscription'],
        });

        if (delivery) {
          const isAxiosError = axios.isAxiosError(error) || (error as { isAxiosError?: boolean })?.isAxiosError === true;
          const errorMsg = isAxiosError ? error.message : String(error);
          const httpStatus = isAxiosError ? error.response?.status : null;
          const responseBodySnippet = this.getResponseBodySnippet(
            isAxiosError ? error.response?.data : undefined,
          );

          delivery.lastError = errorMsg;
          delivery.lastHttpStatus = httpStatus;
          delivery.lastResponseBody = responseBodySnippet;
          delivery.attempts.push({
            attemptNumber,
            timestamp: new Date().toISOString(),
            httpStatus,
            error: errorMsg,
            responseBodySnippet,
            durationMs,
          });

          // Check if we've exhausted retries
          if (attemptNumber >= delivery.maxAttempts) {
            delivery.status = WebhookDeliveryStatus.DEADLETTER;
            delivery.dlqMovedAt = new Date();

            // Update subscription failure stats
            if (delivery.subscription) {
              delivery.subscription.consecutiveFailures += 1;
              delivery.subscription.lastFailureAt = new Date();
              await this.subscriptionRepository.save(delivery.subscription);

              // Alert ops if too many consecutive failures
              if (
                delivery.subscription.consecutiveFailures >=
                this.configService.get<number>('WEBHOOK_FAILURE_ALERT_THRESHOLD', 5)
              ) {
                await this.emitAlertEvent(delivery, delivery.subscription);
              }
            }

            await this.deliveryRepository.save(delivery);

            await this.dlqService.capture({
              jobId: delivery.id,
              queueName: QUEUE_NAMES.WEBHOOK_DELIVERY,
              jobName: JOB_TYPES.WEBHOOK_DELIVER,
              data: {
                deliveryId: delivery.id,
                subscriptionId: data.subscriptionId,
                subscriptionUrl: data.subscriptionUrl,
                eventType: data.eventType,
                eventPayload: data.eventPayload,
                subscriptionSecret: data.subscriptionSecret,
                customHeaders: data.customHeaders,
                tenantId: data.tenantId,
              },
              opts: {
                attempts: delivery.maxAttempts,
                backoff: { type: 'exponential', delay: 1000 },
              },
              failedReason: errorMsg,
              stackTrace: error instanceof Error ? error.stack : undefined,
              attemptsMade: attemptNumber,
            });

            // Emit webhook.delivery.failed audit event
            await this.auditService.log({
              entityType: 'WebhookDelivery',
              entityId: delivery.id,
              action: 'FAILED',
              userId: 'system',
              changes: {
                status: WebhookDeliveryStatus.DEADLETTER,
                error: errorMsg,
                consecutiveFailures: delivery.subscription?.consecutiveFailures,
              },
              metadata: {
                eventType: data.eventType,
                subscriptionUrl: data.subscriptionUrl,
                attemptCount: attemptNumber,
                maxAttempts: delivery.maxAttempts,
              },
            });

            // Emit event for alerting system
            this.eventEmitter.emit('webhook.delivery.failed', {
              deliveryId: delivery.id,
              subscriptionId: data.subscriptionId,
              eventType: data.eventType,
              reason: errorMsg,
              attempts: attemptNumber,
            });

            this.logger.warn(
              `Webhook delivery failed and moved to DLQ: ${data.eventType} to ${data.subscriptionUrl} after ${attemptNumber} attempts`,
            );

            return { success: false }; // Still return false so job is marked failed in queue
          }

          // Update for retry attempt
          delivery.nextRetryAt = new Date(Date.now() + this.getRetryDelayMs(attemptNumber));
          await this.deliveryRepository.save(delivery);

          this.logger.warn(
            `Webhook delivery attempt ${attemptNumber} failed, will retry: ${data.eventType} to ${data.subscriptionUrl}`,
          );
        }
      } catch (innerError) {
        this.logger.error(`Failed to update delivery record after error:`, innerError);
      }

      // Throw to trigger BullMQ retry
      throw error;
    }
  }

  /**
   * Move a delivery to DLQ manually (admin action).
   */
  async moveToDeadLetter(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    delivery.status = WebhookDeliveryStatus.DEADLETTER;
    delivery.dlqMovedAt = new Date();

    return this.deliveryRepository.save(delivery);
  }

  /**
   * Replay a failed delivery from DLQ.
   */
  async replayDelivery(deliveryId: string, userId: string): Promise<void> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
      relations: ['subscription'],
    });

    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    if (delivery.status !== WebhookDeliveryStatus.DEADLETTER) {
      throw new Error(`Delivery is not in DLQ status: ${delivery.status}`);
    }

    // Reset delivery for replay
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.attemptCount = 0;
    delivery.nextRetryAt = new Date();
    delivery.attempts = [];

    await this.deliveryRepository.save(delivery);

    const secret = await this.subscriptionRepository.findOne({
      where: { id: delivery.subscription.id },
      select: { id: true, secret: true },
    });

    // Re-queue the job
    await this.webhookQueue.add(
      JOB_TYPES.WEBHOOK_DELIVER,
      {
        deliveryId: delivery.id,
        subscriptionId: delivery.subscription.id,
        subscriptionUrl: delivery.subscription.url,
        eventType: delivery.eventType,
        eventPayload: delivery.eventPayload,
        subscriptionSecret: secret?.secret ?? undefined,
        customHeaders: delivery.subscription.metadata.customHeaders as Record<string, string>,
        tenantId: delivery.tenantId,
      } as WebhookDeliveryJobData,
      {
        jobId: delivery.id,
        attempts: Math.max(delivery.subscription.maxRetries, 1),
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    // Audit log
    await this.auditService.log({
      entityType: 'WebhookDelivery',
      entityId: delivery.id,
      action: 'REPLAYED',
      userId,
      changes: { status: WebhookDeliveryStatus.PENDING },
      metadata: {
        eventType: delivery.eventType,
        subscriptionUrl: delivery.subscription.url,
      },
    });

    this.logger.log(`Webhook delivery replayed: ${deliveryId} by user ${userId}`);
  }

  /**
   * Emit alert event for ops team when subscription has too many failures.
   */
  private async emitAlertEvent(delivery: WebhookDelivery, subscription: WebhookSubscription): Promise<void> {
    try {
      this.eventEmitter.emit('webhook.subscription.failed', {
        subscriptionId: subscription.id,
        subscriptionUrl: subscription.url,
        consecutiveFailures: subscription.consecutiveFailures,
        lastFailureAt: subscription.lastFailureAt,
        userId: subscription.userId,
      });
    } catch (error) {
      this.logger.error(`Failed to emit webhook failure alert:`, error);
    }
  }
}
