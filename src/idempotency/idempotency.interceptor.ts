import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnprocessableEntityException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Observable, of, firstValueFrom } from 'rxjs';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { HttpIdempotencyEntity } from './idempotency.entity';
import { TenantContext } from '../tenant/context/tenant.context';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IDEMPOTENCY_HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_INTERVAL_MS = 50;

/**
 * Convert the composite key string into a 64-bit bigint suitable for
 * pg_advisory_lock.  We use a deterministic hash so that every concurrent
 * request for the *same* idempotency key maps to the same lock id.
 */
function keyToLockId(compositeKey: string): number {
  // FNV-1a 64-bit hash (works in JS via 32-bit math + folding)
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < compositeKey.length; i++) {
    hash = (hash ^ compositeKey.charCodeAt(i)) >>> 0;
    hash = (Math.imul(hash, 0x01000193)) >>> 0; // FNV prime
  }
  // Fold to a positive 32-bit integer (PostgreSQL advisory lock accepts int64,
  // but a single 32-bit int is sufficient and simpler for our use-case)
  return hash;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @InjectRepository(HttpIdempotencyEntity)
    private readonly repo: Repository<HttpIdempotencyEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    if (!MUTATING_METHODS.has(req.method)) return next.handle();

    const clientKey = req.headers[IDEMPOTENCY_HEADER] as string | undefined;
    if (!clientKey) return next.handle();

    if (clientKey.length > 256) {
      throw new UnprocessableEntityException('Idempotency-Key must be 256 characters or fewer');
    }

    // Principal is populated by JwtStrategy; tenant is the DB-validated one set by TenantInterceptor.
    // Client-supplied headers are never used for namespacing. Anonymous requests are not cached.
    const userId: string | undefined = req.medicalUser?.id;
    const tenantId: string | undefined = TenantContext.getTenantId();
    if (!userId || !tenantId) return next.handle();

    const compositeKey = `${tenantId}:${userId}:${clientKey}`;
    const bodyHash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
    const fingerprint = `${req.method}:${req.path}:${bodyHash}`;
    const cutoff = new Date(Date.now() - TTL_MS);

    // Session-level advisory locks are bound to the connection that took them,
    // so the lock, the work and the unlock must all run on one dedicated connection.
    const lockRunner = this.dataSource.createQueryRunner();
    await lockRunner.connect();

    try {
      await this.acquireLock(lockRunner, compositeKey, clientKey);

      try {
        const existing = await this.repo.findOne({
          where: { key: compositeKey },
        });

        if (existing) {
          if (existing.createdAt < cutoff) {
            await this.repo.delete({ key: compositeKey });
          } else if (existing.requestFingerprint !== fingerprint) {
            throw new UnprocessableEntityException(
              `Idempotency-Key '${clientKey}' was already used for ${existing.requestFingerprint}`,
            );
          } else {
            this.logger.debug(`[Idempotency] Replaying cached response for key=${clientKey}`);

            for (const [name, value] of Object.entries(existing.headers)) {
              res.setHeader(name, value);
            }
            res.setHeader('Idempotent-Replayed', 'true');
            res.status(existing.statusCode);

            return of(existing.body);
          }
        }

        const body = await firstValueFrom(next.handle());
        const statusCode: number = res.statusCode ?? 200;
        const headers: Record<string, string> = {};

        try {
          await this.repo.upsert(
            {
              key: compositeKey,
              statusCode,
              body: body ?? {},
              headers,
              requestFingerprint: fingerprint,
            },
            ['key'],
          );
        } catch (err) {
          // Non-fatal — log and continue; the response has already been sent
          this.logger.error(
            `[Idempotency] Failed to persist key=${clientKey}: ${(err as Error).message}`,
          );
        }

        return of(body);
      } finally {
        await this.releaseLock(lockRunner, compositeKey, clientKey);
      }
    } finally {
      await lockRunner.release();
    }
  }

  /**
   * Polls pg_try_advisory_lock on the given connection until the lock is taken
   * or LOCK_TIMEOUT_MS elapses, so a stuck holder can never hang the request.
   */
  private async acquireLock(
    runner: QueryRunner,
    compositeKey: string,
    clientKey: string,
  ): Promise<void> {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    while (true) {
      const [{ locked }] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [compositeKey],
      );
      if (locked) return;

      if (Date.now() >= deadline) {
        throw new ConflictException(
          `A request with Idempotency-Key '${clientKey}' is already in progress`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
    }
  }

  private async releaseLock(
    runner: QueryRunner,
    compositeKey: string,
    clientKey: string,
  ): Promise<void> {
    const [{ unlocked }] = await runner.query(
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      [compositeKey],
    );
    if (!unlocked) {
      this.logger.error(`[Idempotency] Advisory lock was not held for key=${clientKey}`);
    }
  }
}
