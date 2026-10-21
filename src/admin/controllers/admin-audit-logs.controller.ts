import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { AuditLogService, PaginatedAuditLogs } from '../../common/services/audit-log.service';
import {
  QueryAuditLogsDto,
  PhiAuditAction,
} from '../../common/audit/dto/query-audit-logs.dto';

@ApiTags('Admin - Audit Logs')
@Controller('admin/audit-logs')
@UseGuards(IpAllowlistGuard, JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class AdminAuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Query PHI-sensitive audit logs',
    description:
      'Returns a paginated list of tamper-evident sensitive audit log entries. ' +
      'Supports filtering by actor, action type, patient, and date range. ' +
      'Restricted to admin users only.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-indexed)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (max 100)' })
  @ApiQuery({ name: 'actorAddress', required: false, type: String, description: 'Filter by actor address or wallet' })
  @ApiQuery({ name: 'actorId', required: false, type: String, description: 'Filter by actor user ID' })
  @ApiQuery({ name: 'action', required: false, type: String, description: 'Filter by freeform action string' })
  @ApiQuery({
    name: 'actionType',
    required: false,
    enum: PhiAuditAction,
    description: 'Filter by PHI audit action type',
  })
  @ApiQuery({ name: 'patientId', required: false, type: String, description: "Filter by patient's resource ID" })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date filter (ISO 8601)' })
  async findAll(@Query() query: QueryAuditLogsDto): Promise<PaginatedAuditLogs> {
    return this.auditLogService.findAllSensitive(query);
  }
}
