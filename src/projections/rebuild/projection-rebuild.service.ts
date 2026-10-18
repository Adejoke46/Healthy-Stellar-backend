import { ConflictException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { CheckpointService } from '../checkpoint/checkpoint.service';
import { ProjectionStatusDto, RebuildStatus } from '../dto/projection-status.dto';

const VALID_PROJECTORS = new Set([
  'RecordProjector',
  'AccessGrantProjector',
  'AuditProjector',
  'AnalyticsProjector',
]);

const STATUS_KEY = (name: string) => `projection:rebuild:status:${name}`;
const LOCK_KEY = (name: string) => `projection:rebuild:lock:${name}`;
const STATUS_TTL = 86400; // 24h
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

@Injectable()
export class ProjectionRebuildService {
  private readonly logger = new Logger(ProjectionRebuildService.name);

  constructor(
    @InjectQueue('projection-rebuild') private readonly rebuildQueue: Queue,
    @InjectRedis() private readonly redis: Redis,
    private readonly checkpoints: CheckpointService,
  ) { }

  async triggerRebuild(projectorName: string): Promise<void> {
    if (!VALID_PROJECTORS.has(projectorName)) {
      throw new NotFoundException(`Unknown projector: ${projectorName}`);
    }

    const lockToken = randomUUID();
    const lockAcquired = await this.redis.set(
      LOCK_KEY(projectorName),
      lockToken,
      'EX',
      STATUS_TTL,
      'NX',
    );
    if (lockAcquired !== 'OK') {
      throw new ConflictException(`A rebuild is already running for ${projectorName}`);
    }

    const status: ProjectionStatusDto = {
      projectorName,
      status: RebuildStatus.RUNNING,
      lastProcessedVersion: 0,
      startedAt: new Date().toISOString(),
    };

    try {
      await this.redis.setex(STATUS_KEY(projectorName), STATUS_TTL, JSON.stringify(status));
      await this.rebuildQueue.add(
        'rebuild',
        { projectorName, lockToken },
        { attempts: 1, removeOnComplete: true },
      );
    } catch (error) {
      await this.releaseRebuildLock(projectorName, lockToken);
      throw error;
    }

    this.logger.log(`Rebuild queued for projector: ${projectorName}`);
  }

  async releaseRebuildLock(projectorName: string, lockToken?: string): Promise<void> {
    if (!lockToken) {
      return;
    }

    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, LOCK_KEY(projectorName), lockToken);
  }

  async getStatus(projectorName: string): Promise<ProjectionStatusDto> {
    if (!VALID_PROJECTORS.has(projectorName)) {
      throw new NotFoundException(`Unknown projector: ${projectorName}`);
    }

    const raw = await this.redis.get(STATUS_KEY(projectorName));

    if (!raw) {
      const lastProcessedVersion = await this.checkpoints.getMaxVersion(projectorName);
      return {
        projectorName,
        status: RebuildStatus.IDLE,
        lastProcessedVersion,
      };
    }

    return JSON.parse(raw);
  }

  async updateStatus(projectorName: string, update: Partial<ProjectionStatusDto>): Promise<void> {
    const current = await this.getStatus(projectorName);
    const updated = { ...current, ...update };
    await this.redis.setex(STATUS_KEY(projectorName), STATUS_TTL, JSON.stringify(updated));
  }
}
