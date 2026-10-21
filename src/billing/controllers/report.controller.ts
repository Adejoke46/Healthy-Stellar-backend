import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { ReportService } from '../services/report.service';

@ApiTags('Financial Reporting & Analytics')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.COMPLIANCE_OFFICER)
@Controller('financial-reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('revenue-cycle')
  @ApiOperation({
    summary: 'Revenue cycle metrics',
    description: 'Comprehensive revenue cycle KPIs including days in A/R, collection rate, and denial rate'
  })
  @ApiQuery({ name: 'startDate', required: true, description: 'Report start date' })
  @ApiQuery({ name: 'endDate', required: true, description: 'Report end date' })
  @ApiResponse({
    status: 200,
    description: 'Revenue cycle metrics calculated',
    schema: {
      example: {
        period: { start: '2024-01-01', end: '2024-01-31' },
        metrics: {
          totalCharges: 250000.00,
          totalCollections: 215000.00,
          collectionRate: 86.00,
          daysInAR: 42.5,
          denialRate: 8.5,
          netCollectionRate: 82.3
        }
      }
    }
  })
  async getRevenueCycleMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportService.getRevenueCycleMetrics(startDate, endDate);
  }

  @Get('profitability')
  @ApiOperation({
    summary: 'Profitability analysis',
    description: 'Analyze profitability by service line, provider, and payer mix'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['provider', 'service', 'payer'] })
  @ApiResponse({
    status: 200,
    description: 'Profitability analysis generated',
    schema: {
      example: {
        totalRevenue: 250000.00,
        totalCosts: 175000.00,
        grossProfit: 75000.00,
        profitMargin: 30.00,
        byCategory: [
          { category: 'Cardiology', revenue: 85000.00, profit: 28000.00, margin: 32.94 }
        ]
      }
    }
  })
  async getProfitabilityAnalysis(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.reportService.getProfitabilityAnalysis(startDate, endDate, groupBy);
  }

  @Get('payer-mix')
  @ApiOperation({
    summary: 'Payer mix analysis',
    description: 'Analyze revenue distribution across insurance payers and payment sources'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({
    status: 200,
    description: 'Payer mix analysis generated',
    schema: {
      example: {
        totalRevenue: 250000.00,
        distribution: [
          { payer: 'Medicare', amount: 100000.00, percentage: 40.00 },
          { payer: 'Commercial', amount: 87500.00, percentage: 35.00 },
          { payer: 'Medicaid', amount: 37500.00, percentage: 15.00 },
          { payer: 'Self-Pay', amount: 25000.00, percentage: 10.00 }
        ]
      }
    }
  })
  async getPayerMixAnalysis(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportService.getPayerMixAnalysis(startDate, endDate);
  }

  @Get('cash-flow')
  @ApiOperation({
    summary: 'Cash flow projection',
    description: 'Project cash flow based on outstanding A/R and historical collection patterns'
  })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Projection months (default: 3)' })
  @ApiResponse({
    status: 200,
    description: 'Cash flow projection generated',
    schema: {
      example: {
        currentAR: 125000.00,
        projections: [
          { month: '2024-02', projected: 85000.00, confidence: 0.85 },
          { month: '2024-03', projected: 72000.00, confidence: 0.75 }
        ]
      }
    }
  })
  async getCashFlowProjection(@Query('months') months?: number) {
    return this.reportService.getCashFlowProjection(months || 3);
  }

  @Get('productivity')
  @ApiOperation({
    summary: 'Provider productivity report',
    description: 'Analyze provider productivity metrics including RVUs and revenue per visit'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({ name: 'providerId', required: false, description: 'Filter by provider' })
  @ApiResponse({
    status: 200,
    description: 'Productivity report generated',
    schema: {
      example: {
        providers: [
          {
            providerId: 'provider-001',
            providerName: 'Dr. Smith',
            totalVisits: 245,
            totalRevenue: 125000.00,
            revenuePerVisit: 510.20,
            totalRVUs: 1250.5
          }
        ]
      }
    }
  })
  async getProductivityReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('providerId') providerId?: string,
  ) {
    return this.reportService.getProductivityReport(startDate, endDate, providerId);
  }

  @Get('cost-accounting')
  @ApiOperation({
    summary: 'Cost accounting analysis',
    description: 'Track costs by service line and department for profitability optimization'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({
    status: 200,
    description: 'Cost accounting report generated',
    schema: {
      example: {
        totalCosts: 175000.00,
        byDepartment: [
          { department: 'Cardiology', directCosts: 45000.00, indirectCosts: 12000.00 }
        ],
        costPerEncounter: 285.50
      }
    }
  })
  async getCostAccountingReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportService.getCostAccountingReport(startDate, endDate);
  }

  @Get('benchmark')
  @ApiOperation({
    summary: 'Performance benchmarking',
    description: 'Compare performance metrics against industry benchmarks'
  })
  @ApiQuery({ name: 'metric', required: true, enum: ['collection_rate', 'days_in_ar', 'denial_rate'] })
  @ApiResponse({
    status: 200,
    description: 'Benchmark comparison generated',
    schema: {
      example: {
        metric: 'collection_rate',
        currentValue: 86.5,
        industryAverage: 85.0,
        topQuartile: 92.0,
        performance: 'above_average'
      }
    }
  })
  async getBenchmarkComparison(@Query('metric') metric: string) {
    return this.reportService.getBenchmarkComparison(metric);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Financial dashboard summary',
    description: 'Real-time financial dashboard with key metrics and alerts'
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved',
    schema: {
      example: {
        today: {
          collections: 12500.00,
          charges: 15000.00,
          payments: 45
        },
        mtd: {
          collections: 215000.00,
          charges: 250000.00,
          collectionRate: 86.0
        },
        alerts: [
          { type: 'warning', message: 'Days in A/R increased to 45 days' }
        ]
      }
    }
  })
  async getDashboard() {
    return this.reportService.getDashboard();
  }

  @Post('export')
  @ApiOperation({
    summary: 'Export financial report',
    description: 'Export financial reports in various formats (PDF, Excel, CSV)'
  })
  @ApiResponse({ status: 200, description: 'Report exported successfully' })
  async exportReport(@Body() exportConfig: any) {
    return this.reportService.exportReport(exportConfig);
  }

  @Get('compliance/audit-trail')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Financial audit trail',
    description: 'Generate audit trail for compliance and regulatory reporting'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({ name: 'entityType', required: false, enum: ['billing', 'payment', 'claim'] })
  @ApiResponse({ status: 200, description: 'Audit trail generated' })
  async getAuditTrail(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.reportService.getAuditTrail(startDate, endDate, entityType);
  }
}