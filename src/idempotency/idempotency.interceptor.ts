import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnprocessableEntityException,
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

    await this.dataSource.query(
      'SELECT pg_advisory_lock(hashtext($1))',
      [compositeKey],
    );

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
      await this.dataSource.query(
        'SELECT pg_advisory_unlock(hashtext($1))',
        [compositeKey],
      );
    }
  }
}
