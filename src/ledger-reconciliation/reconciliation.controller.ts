import { Controller, Get, Post, Query, DefaultValuePipe, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { StellarBalanceReconciliationService } from './stellar-balance-reconciliation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin/reconciliation')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliation: LedgerReconciliationService,
    private readonly balanceReconciliation: StellarBalanceReconciliationService,
  ) {}

  @Get('latest')
  @ApiOperation({ summary: 'Get the most recent reconciliation run summary' })
  async getLatest() {
    return this.reconciliation.getLatestRun();
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger a reconciliation run' })
  async trigger() {
    return this.reconciliation.run();
  }

  @Get('reports')
  @ApiOperation({ summary: 'List historical Stellar balance reconciliation reports' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 50)' })
  async getReports(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.balanceReconciliation.getReports(limit);
  }

  @Post('balance/trigger')
  @ApiOperation({ summary: 'Manually trigger a Stellar balance reconciliation' })
  async triggerBalanceReconciliation() {
    return this.balanceReconciliation.runBalanceReconciliation();
  }
}
