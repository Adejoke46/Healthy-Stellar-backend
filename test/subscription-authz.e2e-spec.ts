/**
 * Authz e2e tests for SubscriptionController (/subscriptions).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { SubscriptionController } from '../src/billing/controllers/subscription.controller';
import { SubscriptionService } from '../src/billing/services/subscription.service';
import { UserRole } from '../src/auth/entities/user.entity';
import {
  asUser,
  createGuardedControllerApp,
  OTHER_TENANT,
} from './utils/guarded-controller-app';

const admin = { userId: 'admin-1', role: UserRole.ADMIN };
const billing = { userId: 'billing-1', role: UserRole.BILLING_STAFF };
const patient = { userId: 'patient-1', role: UserRole.PATIENT };
const physician = { userId: 'doctor-1', role: UserRole.PHYSICIAN };

describe('Subscription authorization (e2e)', () => {
  let app: INestApplication;
  let service: Record<string, jest.Mock>;

  beforeAll(async () => {
    service = {
      createPlan: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      getAllPlans: jest.fn().mockResolvedValue([]),
      findPlanById: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      updatePlan: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      deletePlan: jest.fn().mockResolvedValue(undefined),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      findSubscriptionByPatient: jest.fn().mockResolvedValue([]),
      findActiveSubscriptionByPatient: jest.fn().mockResolvedValue(null),
      findSubscriptionById: jest.fn().mockResolvedValue({ id: 'sub-1', patientId: 'patient-1' }),
      searchSubscriptions: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      updateSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      changeSubscriptionPlan: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      cancelSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      suspendSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      reactivateSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    };
    app = await createGuardedControllerApp(SubscriptionController, [
      { provide: SubscriptionService, useValue: service },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('anonymous access', () => {
    it.each([
      ['post', '/subscriptions/plans'],
      ['put', '/subscriptions/plans/plan-1'],
      ['delete', '/subscriptions/plans/plan-1'],
      ['post', '/subscriptions/patient'],
      ['get', '/subscriptions/patient/patient-1'],
      ['put', '/subscriptions/sub-1/plan'],
      ['post', '/subscriptions/sub-1/cancel'],
      ['post', '/subscriptions/sub-1/suspend'],
      ['post', '/subscriptions/sub-1/reactivate'],
    ])('%s %s returns 401', async (method, url) => {
      await (request(app.getHttpServer()) as any)[method](url).expect(401);
    });
  });

  describe('plan management', () => {
    it.each([patient, physician])('POST /plans forbidden for %o', async (user) => {
      await request(app.getHttpServer())
        .post('/subscriptions/plans')
        .set(asUser(user))
        .send({})
        .expect(403);
      expect(service.createPlan).not.toHaveBeenCalled();
    });

    it.each([admin, billing])('POST /plans allowed for %o', async (user) => {
      await request(app.getHttpServer())
        .post('/subscriptions/plans')
        .set(asUser(user))
        .send({})
        .expect(201);
    });

    it('DELETE /plans/:id forbidden for a patient', async () => {
      await request(app.getHttpServer())
        .delete('/subscriptions/plans/plan-1')
        .set(asUser(patient))
        .expect(403);
    });

    it('patients can browse plans', async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set(asUser(patient))
        .expect(200);
    });
  });

  describe('patient subscriptions', () => {
    it('patients cannot enrol themselves or others', async () => {
      await request(app.getHttpServer())
        .post('/subscriptions/patient')
        .set(asUser(patient))
        .send({ patientId: 'patient-1' })
        .expect(403);
    });

    it('a patient can read their own subscriptions', async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/patient/patient-1')
        .set(asUser(patient))
        .expect(200);
    });

    it("a patient cannot read another patient's subscriptions", async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/patient/patient-2')
        .set(asUser(patient))
        .expect(403);
      expect(service.findSubscriptionByPatient).not.toHaveBeenCalled();
    });

    it("a patient cannot read another patient's active subscription", async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/patient/patient-2/active')
        .set(asUser(patient))
        .expect(403);
    });

    it("a patient cannot fetch another patient's subscription by id", async () => {
      service.findSubscriptionById.mockResolvedValueOnce({ id: 'sub-2', patientId: 'patient-2' });
      await request(app.getHttpServer())
        .get('/subscriptions/sub-2')
        .set(asUser(patient))
        .expect(403);
    });

    it('a patient can cancel their own subscription', async () => {
      await request(app.getHttpServer())
        .post('/subscriptions/sub-1/cancel')
        .set(asUser(patient))
        .send({ reason: 'moving' })
        .expect(201);
      expect(service.cancelSubscription).toHaveBeenCalledWith('sub-1', 'moving', undefined);
    });

    it("a patient cannot cancel another patient's subscription", async () => {
      service.findSubscriptionById.mockResolvedValueOnce({ id: 'sub-2', patientId: 'patient-2' });
      await request(app.getHttpServer())
        .post('/subscriptions/sub-2/cancel')
        .set(asUser(patient))
        .send({})
        .expect(403);
      expect(service.cancelSubscription).not.toHaveBeenCalled();
    });

    it.each([
      ['put', '/subscriptions/sub-1'],
      ['put', '/subscriptions/sub-1/plan'],
      ['post', '/subscriptions/sub-1/suspend'],
      ['post', '/subscriptions/sub-1/reactivate'],
      ['get', '/subscriptions'],
    ])('patients cannot %s %s', async (method, url) => {
      await (request(app.getHttpServer()) as any)[method](url)
        .set(asUser(patient))
        .send({})
        .expect(403);
    });

    it("billing staff can read any patient's subscriptions", async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/patient/patient-2')
        .set(asUser(billing))
        .expect(200);
    });
  });

  describe('tenant scoping', () => {
    it('rejects requests targeting another tenant', async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/patient/patient-1')
        .set(asUser(billing, OTHER_TENANT))
        .expect(403);
      expect(service.findSubscriptionByPatient).not.toHaveBeenCalled();
    });
  });
});
