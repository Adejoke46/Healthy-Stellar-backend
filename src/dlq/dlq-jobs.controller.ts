import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Request } from 'express';
import { DlqService, DlqListOptions } from './dlq.service';
import { DlqJobStatus } from './dlq-job.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('dlq/jobs')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('dlq')
export class DlqJobsController {
  constructor(private readonly dlqService: DlqService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Inspect DLQ jobs with optional filters' })
  @ApiQuery({ name: 'queueName', required: false })
  @ApiQuery({ name: 'status', required: false, enum: DlqJobStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  listJobs(
    @Query('queueName') queueName?: string,
    @Query('status') status?: DlqJobStatus,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const opts: DlqListOptions = { queueName, status, limit, offset };
    return this.dlqService.list(opts);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get a single DLQ job by UUID' })
  @ApiParam({ name: 'id', type: String })
  findJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlqService.findOne(id);
  }

  @Post('jobs/:id/replay')
  @ApiOperation({ summary: 'Manually replay a DLQ job back into its queue' })
  @ApiParam({ name: 'id', type: String })
  replayJob(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user?.email ?? (req as any).user?.id ?? 'unknown';
    return this.dlqService.replay(id, actor);
  }
}
