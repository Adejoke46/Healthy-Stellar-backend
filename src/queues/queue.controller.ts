import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
  Logger,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { QueueService } from './queue.service';
import { JobStatusResponse, JobNotFoundResponse } from './dto/job-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('jobs')
@Controller('jobs')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Get job status by job ID
   * Returns current status, progress, and any errors
   */
  @Get(':jobId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Get job status by job ID',
    description:
      'Returns the current status of a background job including progress, attempts, and results',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
    type: JobStatusResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Bearer token required',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
    type: JobNotFoundResponse,
  })
  async getJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<JobStatusResponse> {
    this.logger.debug(`Fetching job status: ${jobId}`);

    try {
      const jobStatus = await this.queueService.getJobStatusById(jobId);
      return this.formatStatusResponse(jobStatus);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Job not found: ${jobId}`);
        throw new NotFoundException(
          `Job with ID '${jobId}' not found. Job may have completed and been removed from queue.`,
        );
      }
      throw error;
    }
  }

  /**
   * Subscribe to job status updates (Server-Sent Events)
   */
  @Sse(':jobId/stream')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Stream job status updates (SSE)',
    description:
      'Opens a Server-Sent Events stream for real-time updates on a job\'s lifecycle.',
  })
  streamJobStatus(@Param('jobId') jobId: string): Observable<MessageEvent> {
    this.logger.debug(`Streaming job status for: ${jobId}`);
    return this.queueService.subscribeToJob(jobId).pipe(
      map((status) => ({
        data: this.formatStatusResponse(status),
      } as MessageEvent)),
    );
  }

  /**
   * Get job status by correlation ID (for backward compatibility)
   * Searches all queues for a job matching the correlation ID
   */
  @Get('correlation/:correlationId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Get job status by correlation ID',
    description:
      'Returns job status using the correlation ID provided when the job was created (legacy endpoint)',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
    type: JobStatusResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Bearer token required',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
    type: JobNotFoundResponse,
  })
  async getJobStatusByCorrelationId(
    @Param('correlationId') correlationId: string,
  ): Promise<JobStatusResponse> {
    this.logger.debug(`Fetching job by correlation ID: ${correlationId}`);

    try {
      const jobStatus = await this.queueService.getJobStatus(correlationId);
      return this.formatStatusResponse(jobStatus);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Job not found by correlation ID: ${correlationId}`);
        throw new NotFoundException(
          `Job with correlation ID '${correlationId}' not found.`,
        );
      }
      throw error;
    }
  }

  /**
   * Format job status to API response format
   */
  private formatStatusResponse(jobStatus: any): JobStatusResponse {
    return {
      jobId: jobStatus.jobId,
      correlationId: jobStatus.correlationId,
      status: jobStatus.status,
      progress: jobStatus.progress,
      attempts: jobStatus.attempts,
      error: jobStatus.error,
      result: jobStatus.result,
      createdAt: jobStatus.createdAt,
      startedAt: jobStatus.startedAt,
      completedAt: jobStatus.completedAt,
    };
  }
}
