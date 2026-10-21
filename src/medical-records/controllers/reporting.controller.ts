import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Response } from 'express';
import { ReportingService } from '../services/reporting.service';
import { ReportGenerationService } from '../services/report-generation.service';
import { IpfsService } from '../services/ipfs.service';
import { GenerateReportDto } from '../dto/generate-report.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

const PRIVILEGED_REPORT_ROLES = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.MEDICAL_RECORDS,
];

@ApiTags('Reporting')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly reportGenerationService: ReportGenerationService,
    private readonly ipfsService: IpfsService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Queue a report generation job' })
  @ApiResponse({ status: 201, description: 'Report generation queued' })
  async generateReport(@Body() dto: GenerateReportDto, @Req() req: any) {
    if (req.user.role === UserRole.PATIENT && req.user.id !== dto.patientId) {
      throw new ForbiddenException('Patients may only generate reports for their own records');
    }
    return this.reportGenerationService.queueReportGeneration(dto.patientId, dto.format);
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get report job status' })
  @ApiResponse({ status: 200, description: 'Job status retrieved' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.reportGenerationService.getJobStatus(jobId);

    if (!status) {
      throw new NotFoundException('Job not found');
    }

    return status;
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: 'Download generated report' })
  @ApiResponse({ status: 200, description: 'Report file streamed' })
  async downloadReport(
    @Param('jobId') jobId: string,
    @Query('token') token: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    if (!token) {
      throw new BadRequestException('Token required');
    }

    const job = await this.reportGenerationService.validateDownload(jobId, token);

    if (!job) {
      throw new NotFoundException('Invalid job or token');
    }

    if (job['error']) {
      throw new BadRequestException(job['error']);
    }

    if (!PRIVILEGED_REPORT_ROLES.includes(req.user.role) && job.patientId !== req.user.id) {
      throw new ForbiddenException('You may only download your own reports');
    }

    const fileBuffer = await this.ipfsService.getFile(job.ipfsHash);
    const contentType = job.format === 'pdf' ? 'application/pdf' : 'text/csv';
    const fileName = `medical-report-${jobId}.${job.format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);
  }

  @Get('patient/:patientId/summary')
  @ApiOperation({ summary: 'Get patient medical records summary' })
  @ApiResponse({ status: 200, description: 'Summary retrieved successfully' })
  async getPatientSummary(
    @Param('patientId') patientId: string,
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (req.user.role === UserRole.PATIENT && req.user.id !== patientId) {
      throw new ForbiddenException('Patients may only access their own records');
    }
    return this.reportingService.getPatientSummary(
      patientId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('activity')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER, UserRole.MEDICAL_RECORDS)
  @ApiOperation({ summary: 'Get activity report' })
  @ApiResponse({ status: 200, description: 'Activity report retrieved successfully' })
  async getActivityReport(
    @Query('patientId') patientId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportingService.getActivityReport(
      patientId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('consent')
  @ApiOperation({ summary: 'Get consent report' })
  @ApiResponse({ status: 200, description: 'Consent report retrieved successfully' })
  async getConsentReport(@Query('patientId') patientId: string, @Req() req: any) {
    if (req.user.role === UserRole.PATIENT && req.user.id !== patientId) {
      throw new ForbiddenException('Patients may only access their own consent records');
    }
    return this.reportingService.getConsentReport(patientId);
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  @ApiOperation({ summary: 'Get medical records statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportingService.getRecordStatistics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
