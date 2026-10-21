import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { WebhookSubscription } from '../entities/webhook-subscription.entity';
import { AuditLogService } from '../../common/services/audit-log.service';
import { UserRole } from '../../auth/entities/user.entity';
import {
  CreateWebhookSubscriptionDto,
  UpdateWebhookSubscriptionDto,
} from '../dto/webhook-subscription.dto';

const DEFAULT_MAX_PER_TENANT = 25;

// Event namespaces that carry PHI. Only SUPER_ADMIN may subscribe to these.
const PHI_EVENT_PREFIXES = ['patient.', 'prescription.', 'lab.'];

@Injectable()
export class WebhookSubscriptionService {
  private readonly logger = new Logger(WebhookSubscriptionService.name);

  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly subscriptionRepo: Repository<WebhookSubscription>,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private maxPerTenant(): number {
    return this.configService.get<number>(
      'WEBHOOK_MAX_SUBSCRIPTIONS_PER_TENANT',
      DEFAULT_MAX_PER_TENANT,
    );
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  assertEventsAllowedForRole(role: UserRole, events: string[]): void {
    if (role === UserRole.SUPER_ADMIN) return;

    const phiEvents = events.filter((event) =>
      PHI_EVENT_PREFIXES.some((prefix) => event.startsWith(prefix)),
    );
    if (phiEvents.length > 0) {
      throw new ForbiddenException(
        `Role ${role} may not subscribe to PHI event types: ${phiEvents.join(', ')}`,
      );
    }
  }

  async listSubscriptions(tenantId: string): Promise<WebhookSubscription[]> {
    return this.subscriptionRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async createSubscription(
    tenantId: string,
    userId: string,
    dto: CreateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    const count = await this.subscriptionRepo.count({ where: { tenantId } });
    const cap = this.maxPerTenant();
    if (count >= cap) {
      throw new ForbiddenException(
        `Tenant has reached the maximum of ${cap} webhook subscriptions`,
      );
    }

    const secret = dto.secret ?? this.generateSecret();

    await this.pingEndpoint(dto.url, secret);

    const subscription = this.subscriptionRepo.create({
      tenantId,
      userId,
      url: dto.url,
      events: dto.events,
      secret,
      isActive: true,
      maxRetries: dto.maxRetries ?? 5,
    });

    const saved = await this.subscriptionRepo.save(subscription);

    await this.auditLogService.create({
      operation: 'WEBHOOK_SUBSCRIPTION_CREATED',
      entityType: 'WebhookSubscription',
      entityId: saved.id,
      userId,
      changes: { url: dto.url, events: dto.events },
    });

    this.logger.log(`Webhook subscription created: ${saved.id} for tenant ${tenantId}`);
    return saved;
  }

  async updateSubscription(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    const sub = await this.findOwnedSubscription(tenantId, id);

    if (dto.url !== undefined) sub.url = dto.url;
    if (dto.events !== undefined) sub.events = dto.events;
    if (dto.isActive !== undefined) sub.isActive = dto.isActive;
    if (dto.maxRetries !== undefined) sub.maxRetries = dto.maxRetries;

    const updated = await this.subscriptionRepo.save(sub);

    await this.auditLogService.create({
      operation: 'WEBHOOK_SUBSCRIPTION_UPDATED',
      entityType: 'WebhookSubscription',
      entityId: id,
      userId,
      changes: dto as Record<string, any>,
    });

    return updated;
  }

  async deleteSubscription(tenantId: string, id: string, userId: string): Promise<void> {
    const sub = await this.findOwnedSubscription(tenantId, id);
    await this.subscriptionRepo.remove(sub);

    await this.auditLogService.create({
      operation: 'WEBHOOK_SUBSCRIPTION_DELETED',
      entityType: 'WebhookSubscription',
      entityId: id,
      userId,
    });

    this.logger.log(`Webhook subscription deleted: ${id}`);
  }

  async rotateSecret(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<{ secret: string }> {
    const sub = await this.findOwnedSubscription(tenantId, id);
    const newSecret = this.generateSecret();
    sub.secret = newSecret;
    await this.subscriptionRepo.save(sub);

    await this.auditLogService.create({
      operation: 'WEBHOOK_SECRET_ROTATED',
      entityType: 'WebhookSubscription',
      entityId: id,
      userId,
    });

    this.logger.log(`Webhook secret rotated for subscription: ${id}`);
    return { secret: newSecret };
  }

  async pingEndpoint(url: string, secret: string): Promise<void> {
    const payload = JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    try {
      const response = await axios.post(url, JSON.parse(payload), {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'ping',
          'X-Webhook-Signature': `sha256=${signature}`,
        },
        timeout: 10_000,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new BadRequestException(
          `Endpoint validation failed: target responded with HTTP ${response.status}`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Endpoint validation failed: ${(err as Error).message}`);
    }
  }

  private async findOwnedSubscription(
    tenantId: string,
    id: string,
  ): Promise<WebhookSubscription> {
    const sub = await this.subscriptionRepo.findOne({ where: { id, tenantId } });
    if (!sub) {
      throw new NotFoundException(`Webhook subscription ${id} not found`);
    }
    return sub;
  }
}
