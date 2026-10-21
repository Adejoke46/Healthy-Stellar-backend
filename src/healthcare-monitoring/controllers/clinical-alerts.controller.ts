import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ClinicalAlertService } from '../services/clinical-alert.service';
import { DashboardService } from '../services/dashboard.service';
import { AlertType, AlertPriority } from '../entities/clinical-alert.entity';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('clinical-alerts')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-alerts')
export class ClinicalAlertsController {
  constructor(
    private clinicalAlertService: ClinicalAlertService,
    private dashboardService: DashboardService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.COMPLIANCE_OFFICER)
  async getActiveAlerts(
    @Query('department') department?: string,
    @Query('priority') priority?: AlertPriority,
    @Query('type') alertType?: AlertType,
  ) {
    return await this.clinicalAlertService.getActiveAlerts({
      department,
      priority,
      alertType,
    });
  }

  /**
   * Alert creation via HTTP is restricted to system/admin roles.
   * Programmatic sources (critical-value handler, etc.) should call the service directly.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createAlert(
    @Body()
    alertData: {
      alertType: AlertType;
      priority: AlertPriority;
      title: string;
      message: string;
      patientId?: string;
      department?: string;
      room?: string;
      equipmentId?: string;
      alertData?: Record<string, any>;
    },
  ) {
    return await this.clinicalAlertService.createAlert(alertData);
  }

  @Put(':id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  async acknowledgeAlert(@Param('id') alertId: string, @Request() req: any) {
    const userId: string = req.user.id;
    return await this.clinicalAlertService.acknowledgeAlert(alertId, userId);
  }

  @Put(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  async resolveAlert(
    @Param('id') alertId: string,
    @Body() body: { resolutionNotes?: string },
    @Request() req: any,
  ) {
    const userId: string = req.user.id;
    return await this.clinicalAlertService.resolveAlert(alertId, userId, body.resolutionNotes);
  }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.COMPLIANCE_OFFICER)
  async getClinicalDashboard() {
    return await this.dashboardService.getClinicalDashboard();
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.COMPLIANCE_OFFICER)
  async getAlertMetrics(@Query('days') days: number = 30) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    return await this.clinicalAlertService.getAlertMetrics({
      start: startDate,
      end: endDate,
    });
  }
}
