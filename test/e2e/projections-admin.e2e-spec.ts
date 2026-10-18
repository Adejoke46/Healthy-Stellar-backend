import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthTokenService } from '../../src/auth/services/auth-token.service';
import { SessionManagementService } from '../../src/auth/services/session-management.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { UserRole } from '../../src/auth/entities/user.entity';
import { CheckpointService } from '../../src/projections/checkpoint/checkpoint.service';
import { ProjectionsAdminController } from '../../src/projections/projections-admin.controller';
import { ProjectionRebuildService } from '../../src/projections/rebuild/projection-rebuild.service';
import Redis from 'ioredis';
import { Queue } from 'bull';

describe('Projections admin (e2e)', () => {
    let app: INestApplication;
    const redisValues = new Map<string, string>();
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const redis = {
        set: jest.fn(async (key: string, value: string, ...args: (string | number)[]) => {
            if (args.includes('NX') && redisValues.has(key)) {
                return null;
            }
            redisValues.set(key, value);
            return 'OK';
        }),
        setex: jest.fn(async (key: string, _ttl: number, value: string) => {
            redisValues.set(key, value);
            return 'OK';
        }),
        get: jest.fn(async (key: string) => redisValues.get(key) ?? null),
        eval: jest.fn(async (_script: string, _keyCount: number, key: string, token: string) => {
            if (redisValues.get(key) !== token) {
                return 0;
            }
            redisValues.delete(key);
            return 1;
        }),
    };
    const authTokenService = {
        verifyAccessToken: jest.fn((token: string) => {
            if (token === 'admin-token' || token === 'physician-token') {
                return {
                    userId: token,
                    email: `${token}@example.com`,
                    role: token === 'admin-token' ? UserRole.ADMIN : UserRole.PHYSICIAN,
                    mfaEnabled: false,
                    sessionId: token,
                    organizationId: 'test-org',
                };
            }
            return null;
        }),
    };
    const sessionManagementService = {
        isSessionValid: jest.fn(async () => true),
        updateSessionActivity: jest.fn(async () => undefined),
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [ProjectionsAdminController],
            providers: [
                JwtAuthGuard,
                RolesGuard,
                {
                    provide: ProjectionRebuildService,
                    useFactory: () =>
                        new ProjectionRebuildService(
                            queue as unknown as Queue,
                            redis as unknown as Redis,
                            {} as CheckpointService,
                        ),
                },
                { provide: AuthTokenService, useValue: authTokenService },
                { provide: SessionManagementService, useValue: sessionManagementService },
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    beforeEach(() => {
        redisValues.clear();
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    it('rejects anonymous and non-admin rebuild requests', async () => {
        await request(app.getHttpServer())
            .post('/admin/projections/RecordProjector/rebuild')
            .expect(401);

        await request(app.getHttpServer())
            .post('/admin/projections/RecordProjector/rebuild')
            .set('Authorization', 'Bearer physician-token')
            .expect(403);

        expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects projector names that are not registered', async () => {
        await request(app.getHttpServer())
            .post('/admin/projections/UnknownProjector/rebuild')
            .set('Authorization', 'Bearer admin-token')
            .expect(404);

        expect(queue.add).not.toHaveBeenCalled();
    });

    it('queues an admin rebuild and rejects a concurrent rebuild of the same projector', async () => {
        await request(app.getHttpServer())
            .post('/admin/projections/RecordProjector/rebuild')
            .set('Authorization', 'Bearer admin-token')
            .expect(202);

        await request(app.getHttpServer())
            .post('/admin/projections/RecordProjector/rebuild')
            .set('Authorization', 'Bearer admin-token')
            .expect(409);

        expect(queue.add).toHaveBeenCalledTimes(1);
        expect(queue.add).toHaveBeenCalledWith(
            'rebuild',
            expect.objectContaining({ projectorName: 'RecordProjector', lockToken: expect.any(String) }),
            { attempts: 1, removeOnComplete: true },
        );
    });
});