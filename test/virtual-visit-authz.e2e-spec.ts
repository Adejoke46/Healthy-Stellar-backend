/**
 * Authz e2e tests for VirtualVisitController (/telemedicine/virtual-visits).
 *
 * The controller imports `../services/virtual-visit.service`, which does not
 * exist on disk yet (the telemedicine module has unresolved import paths), so
 * the service is provided as a virtual mock.
 */
jest.mock(
  '../src/telemedicine-and-remote/src/services/virtual-visit.service',
  () => ({ VirtualVisitService: class VirtualVisitService {} }),
  { virtual: true },
);

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { VirtualVisitController } from '../src/telemedicine-and-remote/src/controllers/Virtual visit.controller';
import { VirtualVisitService } from '../src/telemedicine-and-remote/src/services/virtual-visit.service';
import { UserRole } from '../src/auth/entities/user.entity';
import {
  asUser,
  createGuardedControllerApp,
  OTHER_TENANT,
} from './utils/guarded-controller-app';

const admin = { userId: 'admin-1', role: UserRole.ADMIN };
const provider = { userId: 'provider-1', role: UserRole.PHYSICIAN };
const otherProvider = { userId: 'provider-2', role: UserRole.PHYSICIAN };
const patient = { userId: 'patient-1', role: UserRole.PATIENT };
const otherPatient = { userId: 'patient-2', role: UserRole.PATIENT };
const billing = { userId: 'billing-1', role: UserRole.BILLING_STAFF };

const visit = { id: 'visit-1', patientId: 'patient-1', providerId: 'provider-1' };

describe('Virtual visit authorization (e2e)', () => {
  let app: INestApplication;
  let service: Record<string, jest.Mock>;

  beforeAll(async () => {
    service = {
      createVirtualVisit: jest.fn().mockResolvedValue(visit),
      startVirtualVisit: jest.fn().mockResolvedValue(visit),
      completeVirtualVisit: jest.fn().mockResolvedValue(visit),
      cancelVirtualVisit: jest.fn().mockResolvedValue(visit),
      updateVirtualVisit: jest.fn().mockResolvedValue(visit),
      findOne: jest.fn().mockResolvedValue(visit),
      findByPatient: jest.fn().mockResolvedValue([
        visit,
        { id: 'visit-2', patientId: 'patient-1', providerId: 'provider-2' },
      ]),
      findByProvider: jest.fn().mockResolvedValue([visit]),
      getUpcomingVisits: jest.fn().mockResolvedValue([visit]),
      recordVitalSigns: jest.fn().mockResolvedValue(visit),
      reportTechnicalIssue: jest.fn().mockResolvedValue(visit),
      getVisitStatistics: jest.fn().mockResolvedValue({}),
    };
    app = await createGuardedControllerApp(VirtualVisitController, [
      { provide: VirtualVisitService, useValue: service },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('anonymous access', () => {
    it.each([
      ['post', '/telemedicine/virtual-visits'],
      ['post', '/telemedicine/virtual-visits/visit-1/start'],
      ['post', '/telemedicine/virtual-visits/visit-1/complete'],
      ['post', '/telemedicine/virtual-visits/visit-1/cancel'],
      ['put', '/telemedicine/virtual-visits/visit-1'],
      ['get', '/telemedicine/virtual-visits/visit-1'],
      ['get', '/telemedicine/virtual-visits/patient/patient-1'],
      ['get', '/telemedicine/virtual-visits/provider/provider-1'],
      ['get', '/telemedicine/virtual-visits/provider/provider-1/statistics'],
      ['post', '/telemedicine/virtual-visits/visit-1/vital-signs'],
    ])('%s %s returns 401', async (method, url) => {
      await (request(app.getHttpServer()) as any)[method](url).expect(401);
    });
  });

  it('non-clinical roles are rejected', async () => {
    await request(app.getHttpServer())
      .get('/telemedicine/virtual-visits/visit-1')
      .set(asUser(billing))
      .expect(403);
  });

  describe('patient visibility', () => {
    it('a patient can view their own visit', async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/visit-1')
        .set(asUser(patient))
        .expect(200);
    });

    it("a patient cannot view another patient's visit", async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/visit-1')
        .set(asUser(otherPatient))
        .expect(403);
    });

    it("a patient cannot list another patient's visits", async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/patient/patient-1')
        .set(asUser(otherPatient))
        .expect(403);
      expect(service.findByPatient).not.toHaveBeenCalled();
    });

    it('a patient cannot book a visit for someone else', async () => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits')
        .set(asUser(patient))
        .send({ patientId: 'patient-2', providerId: 'provider-1' })
        .expect(403);
      expect(service.createVirtualVisit).not.toHaveBeenCalled();
    });

    it('a patient cannot post vitals into a visit they are not part of', async () => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits/visit-1/vital-signs')
        .set(asUser(otherPatient))
        .send({ heartRate: 80 })
        .expect(403);
      expect(service.recordVitalSigns).not.toHaveBeenCalled();
    });
  });

  describe('provider visibility', () => {
    it('a provider only sees patient visits they participate in', async () => {
      const res = await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/patient/patient-1')
        .set(asUser(provider))
        .expect(200);
      expect(res.body).toEqual([visit]);
    });

    it('a provider cannot view a visit they do not participate in', async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/visit-1')
        .set(asUser(otherProvider))
        .expect(403);
    });

    it("a provider cannot read another provider's schedule or statistics", async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/provider/provider-1')
        .set(asUser(otherProvider))
        .expect(403);
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/provider/provider-1/statistics')
        .set(asUser(otherProvider))
        .expect(403);
      expect(service.findByProvider).not.toHaveBeenCalled();
      expect(service.getVisitStatistics).not.toHaveBeenCalled();
    });

    it("admins can read any provider's schedule", async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/provider/provider-1')
        .set(asUser(admin))
        .expect(200);
    });
  });

  describe('start / complete', () => {
    it('the assigned provider can start the visit (identity taken from token)', async () => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits/visit-1/start')
        .set(asUser(provider))
        .send({ providerId: 'spoofed' })
        .expect(201);
      expect(service.startVirtualVisit).toHaveBeenCalledWith('visit-1', 'provider-1');
    });

    it('another provider cannot start the visit', async () => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits/visit-1/start')
        .set(asUser(otherProvider))
        .send({ providerId: 'provider-1' })
        .expect(403);
      expect(service.startVirtualVisit).not.toHaveBeenCalled();
    });

    it('another provider cannot complete the visit', async () => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits/visit-1/complete')
        .set(asUser(otherProvider))
        .send({ providerId: 'provider-1', notes: 'x' })
        .expect(403);
      expect(service.completeVirtualVisit).not.toHaveBeenCalled();
    });

    it.each([patient, admin])('%o cannot start a visit', async (user) => {
      await request(app.getHttpServer())
        .post('/telemedicine/virtual-visits/visit-1/start')
        .set(asUser(user))
        .expect(403);
    });
  });

  describe('tenant scoping', () => {
    it('rejects requests targeting another tenant', async () => {
      await request(app.getHttpServer())
        .get('/telemedicine/virtual-visits/visit-1')
        .set(asUser(patient, OTHER_TENANT))
        .expect(403);
      expect(service.findOne).not.toHaveBeenCalled();
    });
  });
});
