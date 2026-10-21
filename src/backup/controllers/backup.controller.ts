import { Controller, Get, Post, Body, Param, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { BackupService } from '../services/backup.service';
import { DisasterRecoveryService, RecoveryOptions } from '../services/disaster-recovery.service';
import { BackupVerificationService } from '../services/backup-verification.service';
import { BackupMonitoringService } from '../services/backup-monitoring.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('backup')
@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly recoveryService: DisasterRecoveryService,
    private readonly verificationService: BackupVerificationService,
    private readonly monitoringService: BackupMonitoringService,
  ) {}

  @Post('full')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createFullBackup() {
    return this.backupService.createFullBackup();
  }

  @Post('incremental')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createIncrementalBackup() {
    return this.backupService.createIncrementalBackup();
  }

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getBackupHistory(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.backupService.getBackupHistory(limit);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getBackup(@Param('id') id: string) {
    return this.backupService.getBackupById(id);
  }

  @Post(':id/verify')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verifyBackup(@Param('id') id: string, @Body('verifiedBy') verifiedBy: string) {
    return this.verificationService.verifyBackup(id, verifiedBy);
  }

  @Get('verification/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getVerificationStatus() {
    return this.verificationService.getVerificationStatus();
  }

  @Post('recovery/plan')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createRecoveryPlan(@Body('backupId') backupId: string) {
    return this.recoveryService.createRecoveryPlan(backupId);
  }

  @Post('recovery/execute')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async executeRecovery(
    @Body() options: RecoveryOptions,
    @Body('performedBy') performedBy: string,
  ) {
    return this.recoveryService.performRecovery(options, performedBy);
  }

  @Post('recovery/test')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async scheduleRecoveryTest(
    @Body('backupId') backupId: string,
    @Body('testedBy') testedBy: string,
  ) {
    return this.recoveryService.scheduleRecoveryTest(backupId, testedBy);
  }

  @Get('recovery/tests')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRecoveryTests(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.recoveryService.getRecoveryTests(limit);
  }

  @Get('monitoring/health')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  async getHealthMetrics() {
    return this.monitoringService.getHealthMetrics();
  }

  @Get('monitoring/alerts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRecentAlerts(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.monitoringService.getRecentAlerts(limit);
  }

  @Get('monitoring/statistics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStatistics(@Query('days') days?: number) {
    return this.monitoringService.getBackupStatistics(days ? parseInt(days as any, 10) : 30);
  }

  @Post('restore/:id/dry-run')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async dryRunRestore(
    @Param('id') id: string,
    @Body('requestedBy') requestedBy: string,
  ) {
    return this.recoveryService.dryRunRestore(id, requestedBy ?? 'admin');
  }

  @Post('recovery/drill/trigger')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async triggerRestoreDrill() {
    return this.recoveryService.scheduledRestoreDrill();
  }
}
