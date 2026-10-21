import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IncidentManagementService } from '../services/incident-management.service';
import {
  AcknowledgeIncidentDto,
  CreateIncidentDto,
  IncidentManagementQueryDto,
  IncidentSlaReportQueryDto,
  ResolveIncidentManagementDto,
} from '../dto/incident-management.dto';

@ApiTags('incidents')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('incidents')
export class IncidentManagementController {
  constructor(private readonly service: IncidentManagementService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new tracked incident' })
  @ApiResponse({ status: 201, description: 'Incident created' })
  create(@Body() dto: CreateIncidentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List incidents' })
  list(@Query() query: IncidentManagementQueryDto) {
    return this.service.list(query);
  }

  @Get('sla-report')
  @ApiOperation({ summary: 'SLA compliance report for a time window' })
  slaReport(@Query() query: IncidentSlaReportQueryDto) {
    return this.service.getSlaReport(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single incident' })
  findOne(@Param('id') id: string) {
    return this.service.findOneOrFail(id);
  }

  @Patch(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an incident (sets firstResponseAt)' })
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeIncidentDto,
    @Req() req: Request,
  ) {
    const responderId = (req.user as any)?.id ?? 'unknown';
    return this.service.acknowledge(id, dto, responderId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve an incident' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveIncidentManagementDto,
    @Req() req: Request,
  ) {
    const responderId = (req.user as any)?.id ?? 'unknown';
    return this.service.resolve(id, dto, responderId);
  }
}
