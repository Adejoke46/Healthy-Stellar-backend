import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request, Response } from 'express';
import { ReportFormat } from './entities/report-job.entity';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Queue a report generation job (pdf, csv, or xlsx)' })
  @ApiResponse({ status: 202, description: 'Report generation queued' })
  async generateReport(
    @Req() req: Request,
    @Body('format') format: ReportFormat = ReportFormat.PDF,
  ) {
    const patientId = (req.user as any).id;
    return this.reportsService.requestReport(patientId, format);
  }

  @Get(':jobId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Get report generation job status' })
  async getJobStatus(@Req() req: Request, @Param('jobId') jobId: string) {
    const patientId = (req.user as any).id;
    return this.reportsService.getJobStatus(jobId, patientId);
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: 'Download generated report file via single-use token' })
  @ApiResponse({ status: 200, description: 'File stream' })
  @ApiResponse({ status: 403, description: 'Invalid or expired token' })
  async downloadReport(
    @Param('jobId') jobId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new HttpException('Token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const stream = await this.reportsService.downloadReport(jobId, token);

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="medical-history-report-${jobId}"`,
      });

      stream.pipe(res);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to download report', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
