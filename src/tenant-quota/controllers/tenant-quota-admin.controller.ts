import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';

import {
  TenantNearLimitDto,
  TenantQuotaUsageResponseDto,
  UpdateTenantQuotaDto,
} from '../dto/tenant-quota.dto';
import { TenantQuotaService } from '../services/tenant-quota.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

/**
 * Admin-only endpoints for inspecting and managing per-tenant resource quotas.
 * Requires a JWT and the admin role.
 */
@ApiTags('Admin – Tenant Quotas')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/tenants')
export class TenantQuotaAdminController {
  constructor(private readonly quotaService: TenantQuotaService) {}

  /**
   * GET /admin/tenants/quota/near-limit
   *
   * Lists tenants currently at/over their usage warning threshold,
   * highest usage first. Populated by the scheduled threshold check.
   */
  @Get('quota/near-limit')
  @ApiOperation({
    summary: 'List tenants near their quota warning threshold',
    description:
      'Returns tenants whose usage crossed a configurable warning threshold, ' +
      'ordered by usage (highest first).',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenants at/over their warning threshold',
    type: [TenantNearLimitDto],
  })
  async listNearLimit() {
    return this.quotaService.listTenantsNearLimit();
  }

  /**
   * GET /admin/tenants/:id/usage
   *
   * Returns real-time quota counters and limits for a specific tenant.
   * All counter values are read from Redis so they reflect live traffic.
   */
  @Get(':id/usage')
  @ApiOperation({
    summary: 'Get quota usage for a tenant',
    description:
      'Returns current counter values (from Redis) alongside the enforced ' +
      'limits. Use this to monitor noisy-neighbor risk or debug 429 errors.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({
    status: 200,
    description: 'Quota usage snapshot',
    type: TenantQuotaUsageResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getUsage(
    @Param('id') tenantId: string,
  ): Promise<TenantQuotaUsageResponseDto> {
    return this.quotaService.getUsageSummary(tenantId) as any;
  }

  /**
   * PATCH /admin/tenants/:id/quota
   *
   * Update the tier or custom overrides for a tenant.
   * Any field omitted from the body is left unchanged.
   */
  @Patch(':id/quota')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update quota limits for a tenant',
    description:
      'Change the pricing tier or set custom per-field overrides. ' +
      'Custom overrides take precedence over tier defaults. ' +
      'Setting a field to `null` reverts it to the tier default.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Updated quota configuration' })
  async updateQuota(
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantQuotaDto,
  ) {
    return this.quotaService.updateQuota(tenantId, dto);
  }

  /**
   * DELETE /admin/tenants/:id/quota/counters
   *
   * Manually reset Redis counters (useful after a tenant migration or
   * when a billing dispute is resolved in the tenant's favour).
   */
  @Delete(':id/quota/counters')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetCounters(@Param('id') tenantId: string): Promise<void> {
    await this.quotaService.resetCounters(tenantId);
  }
}