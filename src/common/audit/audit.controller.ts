import { Controller, Get, Query, Res, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../constants/swagger.constants';
import { AuditService } from './audit.service';
import { AuditLogEntity } from './audit-log.entity';

/**
 * AuditController – read-only access to the immutable audit trail.
 * Only Admin and Patient roles are authorised (guard enforcement happens at the
 * module level; placeholder structure is shown here).
 */
@ApiTags('Audit')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /audit?patientId=&fromDate=&toDate=
   * Returns a paginated audit log filtered by patient, date range.
   */
  @Get()
  @ApiOperation({ summary: 'Get paginated audit log (Admin/Patient only)' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('patientId') patientId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ): Promise<{ data: AuditLogEntity[]; total: number; page: number; limit: number }> {
    return this.auditService.findAll({
      patientId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: Number(page),
      limit: Number(limit),
    });
  }

  /**
   * GET /audit/export
   * Streams audit log rows as a CSV file.
   */
  @Get('export')
  @ApiOperation({ summary: 'Export audit log as CSV (Admin only)' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  async exportCsv(
    @Query('patientId') patientId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const { data } = await this.auditService.findAll({
      patientId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: 1,
      limit: 10_000,
    });

    const csv = this.auditService.toCsv(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${Date.now()}.csv"`);
    res.send(csv);
  }
}
