import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Request } from 'express';
import { DlqService, DlqListOptions } from './dlq.service';
import { DlqJobStatus } from './dlq-job.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin/dlq')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  // ── Stats ─────────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'DLQ stats grouped by queue and status' })
  stats() {
    return this.dlqService.stats();
  }

  // ── List ──────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List DLQ entries with optional filters' })
  @ApiQuery({ name: 'queueName', required: false })
  @ApiQuery({ name: 'status', required: false, enum: DlqJobStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @Query('queueName') queueName?: string,
    @Query('status') status?: DlqJobStatus,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const opts: DlqListOptions = {
      queueName,
      status,
      limit,
      offset,
    };
    return this.dlqService.list(opts);
  }

  // ── Single entry ──────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single DLQ entry by UUID' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlqService.findOne(id);
  }

  // ── Replay single ─────────────────────────────────────────────────────────

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay a single DLQ entry back into its queue' })
  @ApiParam({ name: 'id', type: String })
  replay(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user?.email ?? (req as any).user?.id ?? 'unknown';
    return this.dlqService.replay(id, actor);
  }

  // ── Replay all ────────────────────────────────────────────────────────────

  @Post('replay-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replay all failed DLQ entries (optionally filtered by queue)' })
  @ApiQuery({ name: 'queueName', required: false })
  replayAll(@Query('queueName') queueName?: string, @Req() req?: Request) {
    const actor = (req as any)?.user?.email ?? 'system';
    return this.dlqService.replayAll(queueName, actor);
  }

  // ── Discard ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Discard a DLQ entry (marks as discarded, no replay)' })
  @ApiParam({ name: 'id', type: String })
  discard(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user?.email ?? (req as any).user?.id ?? 'unknown';
    return this.dlqService.discard(id, actor);
  }
}
