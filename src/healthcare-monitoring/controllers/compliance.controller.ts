import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ComplianceMonitoringService } from '../services/compliance-monitoring.service';
import { ComplianceType } from '../entities/compliance-check.entity';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

/**
 * Compliance data is platform-wide and intentionally NOT tenant-scoped:
 * compliance posture, violations and check runs span all tenants, so these
 * endpoints are restricted to platform-level admin/compliance roles instead
 * of being filtered by tenant.
 */
@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPLIANCE_OFFICER)
export class ComplianceController {
  constructor(private complianceService: ComplianceMonitoringService) {}

  @Get('status')
  async getComplianceStatus(@Query('type') complianceType?: ComplianceType) {
    return await this.complianceService.getComplianceStatus(complianceType);
  }

  @Post('run-checks')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async runComplianceChecks(@Body() body: { checkTypes?: ComplianceType[] }) {
    // Trigger manual compliance checks, honouring the requested check types
    await this.complianceService.runDailyComplianceChecks(body?.checkTypes);
    return { message: 'Compliance checks initiated' };
  }

  @Get('dashboard')
  async getComplianceDashboard() {
    return await this.complianceService.getComplianceStatus();
  }
}
