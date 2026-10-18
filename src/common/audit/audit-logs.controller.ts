import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { AuditLogService, PaginatedAuditLogs } from '../services/audit-log.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('Admin – PHI Audit Logs')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /admin/audit-logs
   * Append-only PHI audit trail — admin only.
   * Filterable by patient, actor, action type, and date range.
   */
  @Get()
  @ApiOperation({
    summary: 'Get paginated PHI audit logs (Admin only)',
    description:
      'Returns an immutable, append-only audit trail of all PHI access events. ' +
      'Supports filtering by patientId, actorAddress, action type, and date range.',
  })
  @ApiQuery({ name: 'patientId', required: false, description: 'Filter by patient UUID' })
  @ApiQuery({ name: 'actorAddress', required: false, description: 'Filter by actor (user ID or wallet address)' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action (PHI_READ, PHI_WRITE, PHI_DELETE, GRANT_CHANGE, …)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Earliest timestamp (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Latest timestamp (ISO 8601)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(@Query() query: QueryAuditLogsDto): Promise<PaginatedAuditLogs> {
    return this.auditLogService.findAllSensitive(query);
  }
}
