import { Controller, Get, Post, HttpCode, HttpStatus, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { ConsistencyCheckerService, ConsistencyReport } from './consistency-checker.service';
import { ConsistencyIncident } from './consistency-incident.entity';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('consistency-checker')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consistency')
export class ConsistencyCheckerController {
  constructor(private readonly checker: ConsistencyCheckerService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a full consistency check' })
  @ApiResponse({ status: 200, description: 'Consistency report' })
  async run(): Promise<ConsistencyReport> {
    return this.checker.runFullCheck();
  }

  @Get('health')
  @ApiOperation({ summary: 'Quick consistency health probe' })
  async health(): Promise<{ healthy: boolean; checkedAt: Date }> {
    const report = await this.checker.runFullCheck();
    return { healthy: report.healthy, checkedAt: report.checkedAt };
  }

  @Get('incidents')
  @ApiOperation({ summary: 'List open consistency incidents with severity and affected record count' })
  async incidents(): Promise<ConsistencyIncident[]> {
    return this.checker.listOpenIncidents();
  }

  @Post('incidents/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually resolve a consistency incident' })
  @ApiResponse({ status: 200, description: 'Resolved incident' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async resolveIncident(
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
  ): Promise<ConsistencyIncident> {
    return this.checker.resolveIncident(id, dto.resolvedBy, dto.reason);
  }
}
