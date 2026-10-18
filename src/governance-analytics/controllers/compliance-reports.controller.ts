import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { ComplianceReportsService } from '../services/compliance-reports.service';
import { GenerateComplianceReportDto } from '../dto/compliance-report.dto';

@ApiTags('Governance Compliance Reports')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPLIANCE_OFFICER)
@Controller('governance/reports')
export class ComplianceReportsController {
  constructor(private readonly complianceReportsService: ComplianceReportsService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a compliance report',
    description: 'Queues an async job that builds a HIPAA/GDPR/SOC2 compliance report for the given date range',
  })
  @ApiResponse({ status: 202, description: 'Report generation queued' })
  async generate(@Req() req: any, @Body() dto: GenerateComplianceReportDto) {
    return this.complianceReportsService.requestReport(dto, req.user?.id);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get compliance report job status/summary' })
  @ApiParam({ name: 'jobId' })
  async getStatus(@Param('jobId') jobId: string) {
    return this.complianceReportsService.getJob(jobId);
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: 'Download the generated compliance report' })
  @ApiParam({ name: 'jobId' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'csv'], required: false })
  async download(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Query('format') format: 'pdf' | 'csv' = 'pdf',
    @Res() res: Response,
  ) {
    const buffer = await this.complianceReportsService.download(jobId, format, req.user?.id);
    res.set({
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv',
      'Content-Disposition': `attachment; filename="compliance-report-${jobId}.${format}"`,
    });
    res.send(buffer);
  }
}
