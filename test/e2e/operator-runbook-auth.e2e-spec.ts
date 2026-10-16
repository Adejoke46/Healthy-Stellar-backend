import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { RunbookController } from '../../src/operator-runbook/controllers/runbook.controller';
import { RunbookMappingController } from '../../src/operator-runbook/controllers/runbook-mapping.controller';
import { RunbookService } from '../../src/operator-runbook/services/runbook.service';
import { Runbook, RunbookStatus } from '../../src/operator-runbook/entities/runbook.entity';
import {
  ExecutionStatus,
  RunbookExecution,
} from '../../src/operator-runbook/entities/runbook-execution.entity';
import { RunbookMapping } from '../../src/operator-runbook/entities/runbook-mapping.entity';
import { AuditService } from '../../src/common/audit/audit.service';
import { AuthTokenService } from '../../src/auth/services/auth-token.service';
import { SessionManagementService } from '../../src/auth/services/session-management.service';
import { UserRole } from '../../src/auth/entities/user.entity';

/**
 * Regression coverage for #1158: runbook routes must require an authenticated
 * admin, and execution approvals must use the caller's identity from the JWT.
 */
describe('Operator Runbook authorization (e2e)', () => {
  let app: INestApplication;

  const RUNBOOK_ID = '11111111-1111-4111-8111-111111111111';
  const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
  const MAPPING_ID = '33333333-3333-4333-8333-333333333333';

  const tokens: Record<string, { userId: string; role: UserRole }> = {
    'admin-a-token': { userId: 'admin-a', role: UserRole.ADMIN },
    'admin-b-token': { userId: 'admin-b', role: UserRole.ADMIN },
    'physician-token': { userId: 'physician-1', role: UserRole.PHYSICIAN },
  };

  const authTokenServiceMock = {
    verifyAccessToken: jest.fn((token: string) => {
      const user = tokens[token];
      if (!user) return null;
      return {
        ...user,
        email: `${user.userId}@test.com`,
        mfaEnabled: false,
        sessionId: `session-${user.userId}`,
        organizationId: 'tenant-1',
      };
    }),
  };

  const sessionManagementServiceMock = {
    isSessionValid: jest.fn(async (sessionId: string) => sessionId.startsWith('session-')),
    updateSessionActivity: jest.fn(async () => undefined),
  };

  const runbookRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
  };

  const executionRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => ({ id: EXECUTION_ID, ...e })),
  };

  const mappingRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    remove: jest.fn(),
  };

  const auditServiceMock = { log: jest.fn(async () => undefined) };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RunbookController, RunbookMappingController],
      providers: [
        RunbookService,
        { provide: getRepositoryToken(Runbook), useValue: runbookRepo },
        { provide: getRepositoryToken(RunbookExecution), useValue: executionRepo },
        { provide: getRepositoryToken(RunbookMapping), useValue: mappingRepo },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        { provide: SessionManagementService, useValue: sessionManagementServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('RunbookController', () => {
    it('rejects anonymous list with 401', async () => {
      await request(app.getHttpServer()).get('/operator/runbooks').expect(401);
    });

    it('rejects anonymous execution initiation with 401', async () => {
      await request(app.getHttpServer())
        .post(`/operator/runbooks/${RUNBOOK_ID}/executions`)
        .send({ reason: 'db failover' })
        .expect(401);
      expect(executionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects anonymous approval with 401', async () => {
      await request(app.getHttpServer())
        .patch(`/operator/runbooks/${RUNBOOK_ID}/executions/${EXECUTION_ID}/approve`)
        .send({})
        .expect(401);
      expect(executionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects an invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/operator/runbooks')
        .set(bearer('forged-token'))
        .expect(401);
    });

    it('rejects non-admin list with 403', async () => {
      await request(app.getHttpServer())
        .get('/operator/runbooks')
        .set(bearer('physician-token'))
        .expect(403);
    });

    it('rejects non-admin execution initiation with 403', async () => {
      await request(app.getHttpServer())
        .post(`/operator/runbooks/${RUNBOOK_ID}/executions`)
        .set(bearer('physician-token'))
        .send({ reason: 'db failover' })
        .expect(403);
      expect(executionRepo.save).not.toHaveBeenCalled();
    });

    it('allows an admin to list runbooks', async () => {
      await request(app.getHttpServer())
        .get('/operator/runbooks')
        .set(bearer('admin-a-token'))
        .expect(200);
    });

    it('records the initiator from the JWT', async () => {
      runbookRepo.findOne.mockResolvedValueOnce({
        id: RUNBOOK_ID,
        status: RunbookStatus.ACTIVE,
        requiresDualApproval: true,
      });

      const res = await request(app.getHttpServer())
        .post(`/operator/runbooks/${RUNBOOK_ID}/executions`)
        .set(bearer('admin-a-token'))
        .send({ reason: 'db failover' })
        .expect(201);

      expect(res.body.initiatedBy).toBe('admin-a');
      expect(res.body.status).toBe(ExecutionStatus.PENDING_APPROVAL);
    });

    it('forbids the initiator from approving their own execution', async () => {
      executionRepo.findOne.mockResolvedValueOnce({
        id: EXECUTION_ID,
        runbookId: RUNBOOK_ID,
        initiatedBy: 'admin-a',
        status: ExecutionStatus.PENDING_APPROVAL,
      });

      await request(app.getHttpServer())
        .patch(`/operator/runbooks/${RUNBOOK_ID}/executions/${EXECUTION_ID}/approve`)
        .set(bearer('admin-a-token'))
        .send({})
        .expect(403);
      expect(executionRepo.save).not.toHaveBeenCalled();
    });

    it('records a different admin as approver from the JWT', async () => {
      executionRepo.findOne.mockResolvedValueOnce({
        id: EXECUTION_ID,
        runbookId: RUNBOOK_ID,
        initiatedBy: 'admin-a',
        status: ExecutionStatus.PENDING_APPROVAL,
      });
      runbookRepo.findOne.mockResolvedValueOnce({
        id: RUNBOOK_ID,
        status: RunbookStatus.ACTIVE,
        requiresDualApproval: false,
      });

      const res = await request(app.getHttpServer())
        .patch(`/operator/runbooks/${RUNBOOK_ID}/executions/${EXECUTION_ID}/approve`)
        .set(bearer('admin-b-token'))
        .send({})
        .expect(200);

      expect(res.body.approvedBy).toBe('admin-b');
      expect(res.body.status).toBe(ExecutionStatus.APPROVED);
    });

    it('rejects approver identity supplied in the request body', async () => {
      await request(app.getHttpServer())
        .patch(`/operator/runbooks/${RUNBOOK_ID}/executions/${EXECUTION_ID}/approve`)
        .set(bearer('admin-b-token'))
        .send({ approverId: 'someone-else' })
        .expect(400);
    });
  });

  describe('RunbookMappingController', () => {
    it('rejects anonymous access with 401', async () => {
      await request(app.getHttpServer()).get('/admin/runbook-mappings').expect(401);
    });

    it('rejects non-admin access with 403', async () => {
      await request(app.getHttpServer())
        .get('/admin/runbook-mappings')
        .set(bearer('physician-token'))
        .expect(403);
    });

    it('rejects anonymous deletion with 401', async () => {
      await request(app.getHttpServer()).delete(`/admin/runbook-mappings/${MAPPING_ID}`).expect(401);
      expect(mappingRepo.remove).not.toHaveBeenCalled();
    });

    it('allows an admin to list mappings', async () => {
      await request(app.getHttpServer())
        .get('/admin/runbook-mappings')
        .set(bearer('admin-a-token'))
        .expect(200);
    });
  });
});
