import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PushNotificationService } from '../services/push-notification.service';
import { RegisterDeviceTokenDto, DeregisterDeviceTokenDto } from '../dto/device-token.dto';

@ApiTags('Push Notifications')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('notifications/device-tokens')
export class DeviceTokenController {
  constructor(private readonly pushService: PushNotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Register a device token for push notifications (FCM/APNs)' })
  @ApiResponse({ status: 201, description: 'Token registered' })
  register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    return this.pushService.registerToken(req.user.id, dto.token, dto.platform);
  }

  @Delete()
  @ApiOperation({ summary: 'Deregister a device token' })
  @ApiResponse({ status: 200, description: 'Token deregistered' })
  deregister(@Req() req: any, @Body() dto: DeregisterDeviceTokenDto) {
    return this.pushService.deregisterToken(req.user.id, dto.token);
  }
}
