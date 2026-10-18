import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { TenantGuard } from '../tenant/guards/tenant.guard';
import { TenantInterceptor } from '../tenant/interceptors/tenant.interceptor';
import { TenantContext } from '../tenant/context/tenant.context';
import { OperationalDashboardService } from './services/operational-dashboard.service';
import { OperationalDashboardDto, UtilizationTrendDto } from './dto/operational-dashboard.dto';

@ApiTags('Analytics')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('analytics/operational')
@UseGuards(JwtAuthGuard, AdminGuard, TenantGuard)
@UseInterceptors(TenantInterceptor)
export class OperationalDashboardController {
  constructor(private readonly dashboardService: OperationalDashboardService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Live bed and OR utilization dashboard',
    description:
      'Returns aggregated live occupancy for all beds and operating rooms, with configurable ' +
      'utilization thresholds that surface a warning state. Real-time updates are pushed via ' +
      'the WebSocket gateway at /analytics/dashboard (subscribe to tenant:<tenantId> room).',
  })
  @ApiResponse({ status: 200, type: OperationalDashboardDto })
  async getLiveDashboard(): Promise<OperationalDashboardDto> {
    const tenantId = TenantContext.getTenantId() ?? 'system';
    return this.dashboardService.getLiveDashboard(tenantId);
  }

  @Get('trend')
  @ApiOperation({
    summary: 'Historical bed and OR utilization trend',
    description: 'Returns per-day utilization rates over the requested window (default 30 days).',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Look-back window in days (default 30)' })
  @ApiResponse({ status: 200, type: UtilizationTrendDto })
  async getHistoricalTrend(@Query('days') days?: string): Promise<UtilizationTrendDto> {
    const tenantId = TenantContext.getTenantId() ?? 'system';
    return this.dashboardService.getHistoricalTrend(tenantId, days ? Math.min(parseInt(days, 10), 365) : 30);
  }
}
