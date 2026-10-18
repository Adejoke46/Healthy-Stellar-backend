import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken, DevicePlatform } from '../entities/device-token.entity';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface PushSendResult {
  success: boolean;
  invalidToken?: boolean;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  async registerToken(userId: string, token: string, platform: DevicePlatform): Promise<DeviceToken> {
    // A device token identifies a physical device, so it may only belong to one user.
    // If another user previously registered it (shared tablet/phone), take it over
    // so the old user's notifications stop reaching this device.
    const existing = await this.deviceTokenRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
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
    this.logger.debug(`[${platform.toUpperCase()}] push → ${token}: "${payload.title}"`);
    // In production: call firebase-admin (FCM) or @parse/node-apn (APNs) here.
    // Return { success: false, invalidToken: true } when the provider responds
    // with INVALID_REGISTRATION (FCM) or BadDeviceToken (APNs).
    return { success: true };
  }
}
