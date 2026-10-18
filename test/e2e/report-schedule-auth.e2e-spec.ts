// Factory mock must appear before any other imports so Jest hoists it above the real module
jest.mock('../../src/reports/reports.service', () => ({
  ReportsService: jest.fn().mockImplementation(() => ({
    requestReport: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
  })),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import {
  ReportScheduleController,
  ReportScheduleUnsubscribeController,
} from '../../src/reports/report-schedule.controller';
import { ReportScheduleService } from '../../src/reports/report-schedule.service';
import { ReportsService } from '../../src/reports/reports.service';
import { ReportSchedule } from '../../src/reports/entities/report-schedule.entity';
import { AuthTokenService } from '../../src/auth/services/auth-token.service';
import { SessionManagementService } from '../../src/auth/services/session-management.service';
import { UserRole } from '../../src/auth/entities/user.entity';

/**
 * Regression coverage for #1155 (CRUD must require a tenant-scoped admin) and
 * #1156 (GET unsubscribe must reach its handler rather than GET :id).
 */
describe('Report schedules authorization & unsubscribe (e2e)', () => {
  let app: INestApplication;

  const SCHEDULE_ID = '44444444-4444-4444-8444-444444444444';

  const tokens: Record<string, { userId: string; role: UserRole; organizationId: string }> = {
    'admin-token': { userId: 'admin-1', role: UserRole.ADMIN, organizationId: 'tenant-1' },
    'physician-token': {
      userId: 'physician-1',
      role: UserRole.PHYSICIAN,
      organizationId: 'tenant-1',
    },
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
      };
    }),
  };

  const sessionManagementServiceMock = {
    isSessionValid: jest.fn(async (sessionId: string) => sessionId.startsWith('session-')),
    updateSessionActivity: jest.fn(async () => undefined),
  };

  const scheduleRepo = {
    create: jest.fn((e) => ({ id: SCHEDULE_ID, ...e })),
    save: jest.fn(async (e) => e),
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    remove: jest.fn(async () => undefined),
  };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Same order as ReportsModule: unsubscribe must be registered before :id
      controllers: [ReportScheduleUnsubscribeController, ReportScheduleController],
      providers: [
        ReportScheduleService,
        { provide: getRepositoryToken(ReportSchedule), useValue: scheduleRepo },
        { provide: ReportsService, useValue: { requestReport: jest.fn() } },
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

  describe('admin CRUD', () => {
    it('rejects anonymous list with 401', async () => {
      await request(app.getHttpServer()).get('/admin/report-schedules').expect(401);
      expect(scheduleRepo.find).not.toHaveBeenCalled();
    });

    it('rejects anonymous create with 401', async () => {
      await request(app.getHttpServer())
        .post('/admin/report-schedules')
        .send({ reportType: 'summary', frequency: 'daily', recipients: ['attacker@evil.test'] })
        .expect(401);
      expect(scheduleRepo.save).not.toHaveBeenCalled();
    });

    it('rejects anonymous update with 401', async () => {
      await request(app.getHttpServer())
        .put(`/admin/report-schedules/${SCHEDULE_ID}`)
        .send({ recipients: ['attacker@evil.test'] })
        .expect(401);
      expect(scheduleRepo.save).not.toHaveBeenCalled();
    });

    it('rejects anonymous delete with 401', async () => {
      await request(app.getHttpServer())
        .delete(`/admin/report-schedules/${SCHEDULE_ID}`)
        .expect(401);
      expect(scheduleRepo.remove).not.toHaveBeenCalled();
    });

    it('rejects non-admin access with 403', async () => {
      await request(app.getHttpServer())
        .get('/admin/report-schedules')
        .set(bearer('physician-token'))
        .expect(403);
    });

    it('scopes the list to the caller tenant', async () => {
      await request(app.getHttpServer())
        .get('/admin/report-schedules')
        .set(bearer('admin-token'))
        .expect(200);
      expect(scheduleRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      );
    });

    it('stamps new schedules with the caller tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/report-schedules')
        .set(bearer('admin-token'))
        .send({ reportType: 'summary', frequency: 'daily', recipients: ['ops@example.com'] })
        .expect(201);
      expect(res.body.tenantId).toBe('tenant-1');
    });

    it('returns 404 for a schedule owned by another tenant', async () => {
      scheduleRepo.findOne.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .get(`/admin/report-schedules/${SCHEDULE_ID}`)
        .set(bearer('admin-token'))
        .expect(404);
      expect(scheduleRepo.findOne).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID, tenantId: 'tenant-1' },
      });
    });

    it('rejects a non-UUID id with 400', async () => {
      await request(app.getHttpServer())
        .get('/admin/report-schedules/not-a-uuid')
        .set(bearer('admin-token'))
        .expect(400);
      expect(scheduleRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/report-schedules/unsubscribe', () => {
    it('unsubscribes the recipient with a valid token and no auth header', async () => {
      const schedule = {
        id: SCHEDULE_ID,
        recipients: ['a@example.com', 'b@example.com'],
        isActive: true,
        unsubscribeToken: 'tok-valid',
      };
      scheduleRepo.findOne.mockResolvedValueOnce(schedule);

      const res = await request(app.getHttpServer())
        .get('/admin/report-schedules/unsubscribe')
        .query({ token: 'tok-valid', email: 'a@example.com' })
        .expect(200);

      expect(scheduleRepo.findOne).toHaveBeenCalledWith({
        where: { unsubscribeToken: 'tok-valid' },
      });
      expect(scheduleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ recipients: ['b@example.com'], isActive: true }),
      );
      expect(res.body.message).toContain('a@example.com');
    });

    it('returns 404 for an invalid token', async () => {
      scheduleRepo.findOne.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .get('/admin/report-schedules/unsubscribe')
        .query({ token: 'tok-bogus', email: 'a@example.com' })
        .expect(404);
      expect(scheduleRepo.save).not.toHaveBeenCalled();
    });

    it('returns 400 when token or email is missing', async () => {
      await request(app.getHttpServer())
        .get('/admin/report-schedules/unsubscribe')
        .query({ email: 'a@example.com' })
        .expect(400);
      expect(scheduleRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
