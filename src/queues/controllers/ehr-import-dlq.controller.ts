import {
  Controller, Get, Post, Param, Query, UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { QueueService } from '../queue.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('admin/dlq')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/dlq/ehr-import')
export class EhrImportDlqController {
  constructor(
    @InjectQueue(QUEUE_NAMES.EHR_IMPORT)
    private readonly importQueue: Queue,
    private readonly queueService: QueueService,
  ) {}

  @Get('failed')
  @ApiOperation({ summary: 'List all failed EHR import jobs in the DLQ' })
  async listFailed() {
    const failed = await this.importQueue.getFailed();
    return failed.map((job) => ({
      id: job.id,
      jobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    }));
  }

  @Get(':jobKey')
  @ApiOperation({ summary: 'Get details of a specific failed job' })
  async getFailedJob(@Param('jobKey') jobKey: string) {
    const job = await this.importQueue.getJob(jobKey);
    if (!job) throw new NotFoundException(`Job ${jobKey} not found`);
    const state = await job.getState();
    const failed = state === 'failed';
    return {
      id: job.id,
      jobId: job.data.jobId,
      state,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      progress: job.progress,
      data: job.data,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    };
  }

  @Post(':jobKey/replay')
  @ApiOperation({ summary: 'Replay a failed EHR import job from the DLQ' })
  @ApiQuery({ name: 'maxRetries', required: false, type: Number })
  async replayJob(
    @Param('jobKey') jobKey: string,
    @Query('maxRetries') maxRetries?: string,
  ) {
    const job = await this.importQueue.getJob(jobKey);
    if (!job) throw new NotFoundException(`Job ${jobKey} not found`);

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException(`Job ${jobKey} is not in failed state (current: ${state})`);
    }

    const retries = maxRetries ? parseInt(maxRetries, 10) : 3;
    await job.retry();

    return { message: `Job ${jobKey} replayed successfully`, maxRetries: retries };
  }

  @Post('replay-all')
  @ApiOperation({ summary: 'Replay all failed EHR import jobs' })
  async replayAll() {
    const failed = await this.importQueue.getFailed();
    await Promise.all(failed.map((job) => job.retry()));
    return { replayed: failed.length };
  }
}