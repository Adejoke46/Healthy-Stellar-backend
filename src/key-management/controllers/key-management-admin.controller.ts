import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { EnvelopeKeyManagementService } from '../services/envelope-key-management.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Admin - Key Management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/key-management')
export class KeyManagementAdminController {
  constructor(private readonly keyMgmt: EnvelopeKeyManagementService) {}

  @Post('rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phase-2 master key rotation: re-encrypt all DEKs with MASTER_KEY_NEW' })
  async rotate(@Body('operatorId') operatorId: string) {
    return this.keyMgmt.rotateMasterKey(operatorId ?? 'system');
  }

  @Get('rotation-status')
  @ApiOperation({ summary: 'Get the last 20 key rotation events' })
  async rotationStatus() {
    return this.keyMgmt.getRotationStatus();
  }
}
