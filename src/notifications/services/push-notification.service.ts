import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken, DevicePlatform } from '../entities/device-token.entity';

export const PUSH_DELIVERY_SERVICE = 'PUSH_DELIVERY_SERVICE';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  success: boolean;
  invalidToken?: boolean;
}

export interface PushDeliveryService {
  send(
    platform: DevicePlatform,
    token: string,
    payload: PushPayload,
  ): Promise<PushSendResult>;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
    @Optional() @Inject(PUSH_DELIVERY_SERVICE)
    private readonly pushDeliveryService?: PushDeliveryService,
  ) {}

  async registerToken(userId: string, token: string, platform: DevicePlatform): Promise<DeviceToken> {
    const existing = await this.deviceTokenRepo.findOne({ where: { userId, token } });
    if (existing) {
      existing.active = true;
      return this.deviceTokenRepo.save(existing);
    }
    return this.deviceTokenRepo.save(
      this.deviceTokenRepo.create({ userId, token, platform, active: true }),
    );
  }

  async deregisterToken(userId: string, token: string): Promise<void> {
    await this.deviceTokenRepo.update({ userId, token }, { active: false });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const tokens = await this.deviceTokenRepo.find({ where: { userId, active: true } });
    if (tokens.length === 0) return;

    await Promise.all(tokens.map((dt) => this.deliverWithCleanup(dt, payload)));
  }

  async sendToRegisteredDevices(userId: string, payload: PushPayload): Promise<void> {
    const tokens = await this.deviceTokenRepo.find({ where: { userId, active: true } });
    if (tokens.length === 0) {
      throw new ServiceUnavailableException(`No active push devices registered for ${userId}`);
    }

    await Promise.all(tokens.map((dt) => this.deliverWithCleanup(dt, payload)));
  }

  private async deliverWithCleanup(deviceToken: DeviceToken, payload: PushPayload): Promise<void> {
    const result = await this.sendViaPlatformProvider(deviceToken.platform, deviceToken.token, payload);
    if (result.invalidToken) {
      this.logger.warn(`Deregistering invalid/expired token for user ${deviceToken.userId}`);
      await this.deviceTokenRepo.update({ id: deviceToken.id }, { active: false });
    }
  }

  // Pluggable provider — swap this method body for real FCM/APNs SDK calls.
  private async sendViaPlatformProvider(
    platform: DevicePlatform,
    token: string,
    payload: PushPayload,
  ): Promise<PushSendResult> {
    if (!this.pushDeliveryService) {
      throw new ServiceUnavailableException('Push delivery provider is not configured');
    }

    const result = await this.pushDeliveryService.send(platform, token, payload);
    if (!result.success && !result.invalidToken) {
      throw new ServiceUnavailableException(`Push delivery failed via ${platform.toUpperCase()}`);
    }
    return result;
  }
}
