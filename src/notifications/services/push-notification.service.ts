import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  error?: string;
}

// FCM error codes meaning the registration token will never be valid again.
const FCM_INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

// APNs reasons meaning the device token is malformed or no longer registered (HTTP 410 also means unregistered).
const APNS_INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered']);

// Never log full device tokens; only enough suffix to correlate with a row.
const maskToken = (token: string) => `…${token.slice(-6)}`;

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private fcmApp: any;
  private apnsProvider: any;

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
    @Optional() private readonly configService?: ConfigService,
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
      this.logger.warn(
        `Deregistering invalid/expired token ${maskToken(deviceToken.token)} for user ${deviceToken.userId}`,
      );
      await this.deviceTokenRepo.update({ id: deviceToken.id }, { active: false });
      return;
    }
    if (!result.success) {
      this.logger.warn(
        `[${deviceToken.platform.toUpperCase()}] push to ${maskToken(deviceToken.token)} not delivered: ${result.error}`,
      );
    }
  }

  private async sendViaPlatformProvider(
    platform: DevicePlatform,
    token: string,
    payload: PushPayload,
  ): Promise<PushSendResult> {
    switch (platform) {
      case DevicePlatform.ANDROID:
        return this.sendViaFcm(token, payload);
      case DevicePlatform.IOS:
        return this.sendViaApns(token, payload);
      default:
        return { success: false, error: `unsupported platform ${platform}` };
    }
  }

  // firebase-admin is loaded lazily so the app still boots when FCM is not configured.
  private async sendViaFcm(token: string, payload: PushPayload): Promise<PushSendResult> {
    const serviceAccount = this.configService?.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    if (!serviceAccount) {
      return { success: false, error: 'FCM not configured (FCM_SERVICE_ACCOUNT_JSON missing)' };
    }

    try {
      if (!this.fcmApp) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const admin = require('firebase-admin');
        this.fcmApp = admin.initializeApp(
          { credential: admin.credential.cert(JSON.parse(serviceAccount)) },
          'push-notifications',
        );
      }
      await this.fcmApp.messaging().send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
      return { success: true };
    } catch (err: any) {
      if (FCM_INVALID_TOKEN_CODES.has(err?.code)) {
        return { success: false, invalidToken: true, error: err.code };
      }
      return { success: false, error: err?.code ?? err?.message };
    }
  }

  // @parse/node-apn is loaded lazily for the same reason as firebase-admin above.
  private async sendViaApns(token: string, payload: PushPayload): Promise<PushSendResult> {
    const privateKey = this.configService?.get<string>('APNS_PRIVATE_KEY');
    const keyId = this.configService?.get<string>('APNS_KEY_ID');
    const teamId = this.configService?.get<string>('APNS_TEAM_ID');
    const bundleId = this.configService?.get<string>('APNS_BUNDLE_ID');
    if (!privateKey || !keyId || !teamId || !bundleId) {
      return {
        success: false,
        error: 'APNs not configured (APNS_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID)',
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const apn = require('@parse/node-apn');
      if (!this.apnsProvider) {
        this.apnsProvider = new apn.Provider({
          token: { key: privateKey.replace(/\\n/g, '\n'), keyId, teamId },
          production: this.configService?.get<string>('APNS_PRODUCTION') === 'true',
        });
      }
      const notification = new apn.Notification({
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        topic: bundleId,
        payload: payload.data,
      });
      const response = await this.apnsProvider.send(notification, token);
      const failure = response.failed?.[0];
      if (!failure) return { success: true };

      const invalidToken =
        String(failure.status) === '410' || APNS_INVALID_TOKEN_REASONS.has(failure.response?.reason);
      return {
        success: false,
        invalidToken,
        error: failure.response?.reason ?? `APNs status ${failure.status}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
}
