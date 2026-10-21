import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { CredentialTrackingService } from '../services/credential-tracking.service';
import { CreateStaffCredentialDto } from '../dto/create-staff-credential.dto';

@ApiTags('staff-credentials')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-staff/credentials')
export class CredentialTrackingController {
  constructor(private readonly service: CredentialTrackingService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_RECORDS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a credential/license record for a staff member' })
  addCredential(@Body() dto: CreateStaffCredentialDto, @Req() req: any) {
    const actorId = req.user?.userId ?? req.user?.id ?? dto.verifiedBy;
    return this.service.addCredential({ ...dto, verifiedBy: actorId ?? dto.verifiedBy });
  }

  @Get('staff/:staffId')
  @ApiOperation({ summary: 'Get all credentials for a staff member' })
  getByStaff(@Param('staffId', ParseUUIDPipe) staffId: string, @Req() req: any) {
    if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.SUPER_ADMIN && req.user?.role !== UserRole.MEDICAL_RECORDS && req.user?.userId !== staffId && req.user?.id !== staffId) {
      throw new ForbiddenException('You are not allowed to access this staff credential set');
    }
    return this.service.getCredentialsForStaff(staffId);
  }

  @Get('expiring')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_RECORDS)
  @ApiOperation({ summary: 'Admin: list credentials expiring within N days' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiring(@Query('days') days?: string) {
    return this.service.getExpiringCredentials(days ? parseInt(days, 10) : undefined);
  }

  @Get('expired')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_RECORDS)
  @ApiOperation({ summary: 'Admin: list all expired credentials' })
  getExpired() {
    return this.service.getExpiredCredentials();
  }
}
