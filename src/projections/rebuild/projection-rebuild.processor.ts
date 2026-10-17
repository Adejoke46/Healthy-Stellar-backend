import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ProjectionRebuildService } from './projection-rebuild.service';
import { CheckpointService } from '../checkpoint/checkpoint.service';
import { RebuildStatus } from '../dto/projection-status.dto';

import { DropdownOptions } from '../../common/dto/dropdown-options.dto';
import { EventStoreService } from '../../event-store/event-store.service';
import { IEvent } from '@nestjs/cqrs';

interface RebuildJobData {
  projectorName: string;
  lockToken?: string;
}

@Processor('projection-rebuild')
export class ProjectionRebuildProcessor {
  private readonly logger = new Logger(ProjectionRebuildProcessor.name);

  constructor(
    private readonly rebuildService: ProjectionRebuildService,
    private readonly checkpoints: CheckpointService,
    private readonly eventBus: EventBus,
    @InjectQueue('projection-dlq') private readonly dlq: Queue,
    private readonly eventStore: EventStoreService,
  ) { }

  @Process('rebuild')
  async handleRebuild(job: Job<RebuildJobData>): Promise<void> {
    const { projectorName, lockToken } = job.data;
    this.logger.log(`Starting rebuild for ${projectorName}`);

    try {
      // Reset checkpoint so the projector reprocesses from version 0
      await this.checkpoints.reset(projectorName);

      // Fetch real total from event store
      const total = await this.eventStore.count();
      let processed = 0;

      this.logger.log(`Rebuilding ${projectorName} with ${total} events`);

      await this.rebuildService.updateStatus(projectorName, {
        totalEvents: total,
        processedEvents: 0,
        progressPercent: 0,
      });

      // Stream and republish all events through the EventBus, in global
      // insertion order (paginated by globalSequence — see EventStoreService#streamAll)
      for await (const { event } of this.eventStore.streamAll(0)) {
        await this.eventBus.publish(event as unknown as IEvent);
        processed++;

        if (processed % 100 === 0 || processed === total) {
          await this.rebuildService.updateStatus(projectorName, {
            processedEvents: processed,
            progressPercent: total > 0 ? Math.floor((processed / total) * 100) : 100,
          });
        }
      }

      await this.rebuildService.updateStatus(projectorName, {
        status: RebuildStatus.COMPLETED,
        processedEvents: processed,
        progressPercent: 100,
        completedAt: new Date().toISOString(),
      });

      this.logger.log(`Rebuild completed for ${projectorName}: ${processed} events processed`);
    } catch (err) {
      this.logger.error(`Rebuild failed for ${projectorName}: ${err.message}`);
      await this.rebuildService.updateStatus(projectorName, {
        status: RebuildStatus.FAILED,
        error: err.message,
        completedAt: new Date().toISOString(),
      });
      throw err;
    } finally {
      await this.rebuildService.releaseRebuildLock(projectorName, lockToken);
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<RebuildJobData>, err: Error): Promise<void> {
    this.logger.error(
      `Rebuild job permanently failed for ${job.data.projectorName}: ${err.message}`,
    );
  }
}
