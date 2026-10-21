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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Request } from 'express';
import { IncidentEvidenceService } from './incident-evidence.service';
import {
  CaptureIncidentDto,
  IncidentQueryDto,
  ResolveIncidentDto,
  UpdateIncidentNotesDto,
} from './dto/incident.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('incidents')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('incidents')
export class IncidentEvidenceController {
  constructor(private readonly service: IncidentEvidenceService) {}

  @Post()
  @ApiOperation({ summary: 'Capture a structured incident evidence bundle' })
  @ApiResponse({ status: 201, description: 'Evidence bundle persisted' })
  capture(@Body() dto: CaptureIncidentDto, @Req() req: Request) {
    const triggeredBy = dto.triggeredBy ?? (req.user as any)?.id ?? 'unknown';
    return this.service.capture({ ...dto, triggeredBy });
  }

  @Get()
  @ApiOperation({ summary: 'List incident evidence bundles' })
  list(@Query() query: IncidentQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single incident evidence bundle' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Mark an incident as resolved' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
    @Req() req: Request,
  ) {
    const resolvedBy = (req.user as any)?.id ?? 'unknown';
    return this.service.resolve(id, dto, resolvedBy);
  }

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Append investigation notes to an incident' })
  addNotes(@Param('id') id: string, @Body() dto: UpdateIncidentNotesDto) {
    return this.service.addNotes(id, dto);
  }
}
