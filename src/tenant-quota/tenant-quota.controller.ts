import { Controller, Patch, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { TenantQuotaService } from './tenant-quota.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; // Example Admin Role guard
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('admin/tenant-quota')
@Controller('admin/tenant-quota')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Restrict access to administrative accounts
export class TenantQuotaAdminController {
  constructor(private readonly quotaService: TenantQuotaService) {}

  @Patch(':tenantId/override')
  @HttpCode(HttpStatus.OK)
  async overrideTenantQuota(
    @Param('tenantId') tenantId: string,
    @Body('maxQuota') maxQuota: number,
  ) {
    await this.quotaService.overrideQuota(tenantId, maxQuota);
    return {
      success: true,
      message: `Successfully overridden storage limit for tenant ${tenantId}.`,
    };
  }
}