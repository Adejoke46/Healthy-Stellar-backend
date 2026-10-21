import { Controller, Post, Get, Body, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { CohortQueryService } from './cohort-query.service';
import { CohortReportsService } from './cohort-reports.service';
import { CohortQueryDto } from './dto/cohort-query.dto';
import { CohortQueryResponseDto } from './dto/cohort-response.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReadmissionRateReportDto } from './dto/readmission-rate-response.dto';
import { LengthOfStayReportDto } from './dto/length-of-stay-response.dto';
import { PaginationUtil } from '../common/utils/pagination.util';
import { CsvUtil } from './utils/csv.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * Cohort-level analytics: cohort query builder + built-in reports
 * (issue #685). All queries here run against the analytics read-replica
 * connection rather than the primary database (see ReadReplicaService).
 */
@ApiTags('Analytics - Cohorts')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('analytics')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AnalyticsCohortsController {
  constructor(
    private readonly cohortQueryService: CohortQueryService,
    private readonly cohortReportsService: CohortReportsService,
  ) {}

  @Post('cohorts/query')
  @ApiOperation({
    summary:
      'Run a cohort query: filter patients by diagnosis code, admission date range, age range and ward',
  })
  @ApiResponse({ status: 200, description: 'Matching patient IDs and cohort summary statistics' })
  async queryCohort(
    @Body() query: CohortQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CohortQueryResponseDto | void> {
    const { rows, total, statistics } = await this.cohortQueryService.run(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.format === 'csv') {
      const csv = CsvUtil.toCsv(rows as unknown as Record<string, unknown>[], [
        'patientId',
        'ageYears',
        'admissionDate',
        'dischargeDate',
        'lengthOfStayDays',
        'wardId',
      ]);
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="cohort-query.csv"',
      });
      res.send(csv);
      return;
    }

    return {
      data: rows,
      meta: PaginationUtil.calculateMeta(total, page, limit),
      statistics,
    };
  }

  @Get('reports/readmission-rate')
  @ApiOperation({ summary: 'Built-in report: 30-day readmission rate per ICD-10 category' })
  @ApiResponse({ status: 200, description: 'Readmission rate per ICD-10 category', type: ReadmissionRateReportDto })
  async getReadmissionRateReport(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadmissionRateReportDto | void> {
    const { rows, total } = await this.cohortReportsService.getReadmissionRateReport(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.format === 'csv') {
      const csv = CsvUtil.toCsv(rows as unknown as Record<string, unknown>[], [
        'icd10Category',
        'indexEpisodeCount',
        'readmissionCount',
        'readmissionRatePercent',
      ]);
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="readmission-rate-report.csv"',
      });
      res.send(csv);
      return;
    }

    return { data: rows, meta: PaginationUtil.calculateMeta(total, page, limit) };
  }

  @Get('reports/length-of-stay')
  @ApiOperation({ summary: 'Built-in report: average length of stay per ward per month' })
  @ApiResponse({ status: 200, description: 'Average length of stay per ward per month', type: LengthOfStayReportDto })
  async getLengthOfStayReport(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LengthOfStayReportDto | void> {
    const { rows, total } = await this.cohortReportsService.getLengthOfStayReport(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.format === 'csv') {
      const csv = CsvUtil.toCsv(rows as unknown as Record<string, unknown>[], [
        'wardId',
        'wardName',
        'month',
        'stayCount',
        'averageLengthOfStayDays',
      ]);
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="length-of-stay-report.csv"',
      });
      res.send(csv);
      return;
    }

    return { data: rows, meta: PaginationUtil.calculateMeta(total, page, limit) };
  }
}
