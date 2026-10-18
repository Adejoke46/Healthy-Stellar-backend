/**
 * Authz e2e tests for MedicalStaffController (/medical-staff) and
 * WardShiftsController (/wards/:id/shifts).
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MedicalStaffController } from '../src/medical-staff/medical-staff.controller';
import { WardShiftsController } from '../src/medical-staff/ward-shifts.controller';
import { MedicalStaffService } from '../src/medical-staff/medical-staff.service';
import { UserRole } from '../src/auth/entities/user.entity';
import {
  asUser,
  createGuardedControllerApp,
  OTHER_TENANT,
} from './utils/guarded-controller-app';

const admin = { userId: 'admin-1', role: UserRole.ADMIN };
const hr = { userId: 'hr-1', role: UserRole.MEDICAL_RECORDS };
const doctor = { userId: 'doctor-1', role: UserRole.PHYSICIAN };
const nurse = { userId: 'nurse-1', role: UserRole.NURSE };
const patient = { userId: 'patient-1', role: UserRole.PATIENT };
const billing = { userId: 'billing-1', role: UserRole.BILLING_STAFF };

describe('Medical staff authorization (e2e)', () => {
  let staffApp: INestApplication;
  let wardsApp: INestApplication;
  let service: Record<string, jest.Mock>;

  beforeAll(async () => {
    service = {
      createDoctor: jest.fn().mockResolvedValue({ id: 'doctor-new' }),
      findAllDoctors: jest.fn().mockResolvedValue([]),
      findDoctorById: jest.fn().mockResolvedValue({ id: 'doctor-1' }),
      updateDoctor: jest.fn().mockResolvedValue({ id: 'doctor-1' }),
      getExpiringLicenses: jest.fn().mockResolvedValue([]),
      createShift: jest.fn().mockResolvedValue({ id: 'shift-1' }),
      getStaffWeeklySchedule: jest.fn().mockResolvedValue([]),
      createSchedule: jest.fn().mockResolvedValue({ id: 'schedule-1' }),
      getDoctorSchedule: jest.fn().mockResolvedValue([]),
      createPerformanceMetric: jest.fn().mockResolvedValue({ id: 'metric-1' }),
      getDoctorPerformance: jest.fn().mockResolvedValue([]),
      addContinuingEducation: jest.fn().mockResolvedValue({ id: 'edu-1' }),
      getDoctorEducationCredits: jest.fn().mockResolvedValue({ totalCredits: 0, courses: [] }),
      getWardShifts: jest.fn().mockResolvedValue([]),
    };
    const providers = [{ provide: MedicalStaffService, useValue: service }];
    staffApp = await createGuardedControllerApp(MedicalStaffController, providers);
    wardsApp = await createGuardedControllerApp(WardShiftsController, providers);
  });

  afterAll(async () => {
    await staffApp.close();
    await wardsApp.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('anonymous access', () => {
    it.each([
      ['post', '/medical-staff/doctors'],
      ['get', '/medical-staff/doctors'],
      ['put', '/medical-staff/doctors/doctor-1'],
      ['get', '/medical-staff/licenses/expiring'],
      ['post', '/medical-staff/shifts'],
      ['get', '/medical-staff/doctor-1/schedule'],
      ['post', '/medical-staff/performance'],
      ['get', '/medical-staff/performance/doctor/doctor-1'],
    ])('%s %s returns 401', async (method, url) => {
      await (request(staffApp.getHttpServer()) as any)[method](url).expect(401);
    });

    it('GET /wards/:id/shifts returns 401', async () => {
      await request(wardsApp.getHttpServer()).get('/wards/ward-1/shifts').expect(401);
      expect(service.getWardShifts).not.toHaveBeenCalled();
    });
  });

  describe('writes are limited to admin/HR', () => {
    it.each([doctor, nurse, patient, billing])('POST /doctors forbidden for %o', async (user) => {
      await request(staffApp.getHttpServer())
        .post('/medical-staff/doctors')
        .set(asUser(user))
        .send({})
        .expect(403);
      expect(service.createDoctor).not.toHaveBeenCalled();
    });

    it.each([admin, hr])('POST /doctors allowed for %o', async (user) => {
      await request(staffApp.getHttpServer())
        .post('/medical-staff/doctors')
        .set(asUser(user))
        .send({})
        .expect(201);
    });

    it('PUT /doctors/:id forbidden for a physician', async () => {
      await request(staffApp.getHttpServer())
        .put('/medical-staff/doctors/doctor-1')
        .set(asUser(doctor))
        .send({})
        .expect(403);
    });

    it('POST /shifts forbidden for a nurse', async () => {
      await request(staffApp.getHttpServer())
        .post('/medical-staff/shifts')
        .set(asUser(nurse))
        .send({})
        .expect(403);
    });

    it('GET /licenses/expiring forbidden for a physician', async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/licenses/expiring')
        .set(asUser(doctor))
        .expect(403);
    });
  });

  describe('directory and rosters', () => {
    it('patients cannot list doctors', async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/doctors')
        .set(asUser(patient))
        .expect(403);
    });

    it('clinical staff can list doctors', async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/doctors')
        .set(asUser(nurse))
        .expect(200);
    });

    it('patients cannot read ward rosters', async () => {
      await request(wardsApp.getHttpServer())
        .get('/wards/ward-1/shifts')
        .set(asUser(patient))
        .expect(403);
      expect(service.getWardShifts).not.toHaveBeenCalled();
    });

    it('clinical staff can read ward rosters', async () => {
      await request(wardsApp.getHttpServer())
        .get('/wards/ward-1/shifts')
        .set(asUser(nurse))
        .expect(200);
    });
  });

  describe('performance data', () => {
    it('POST /performance forbidden for HR (admins only)', async () => {
      await request(staffApp.getHttpServer())
        .post('/medical-staff/performance')
        .set(asUser(hr))
        .send({})
        .expect(403);
    });

    it('a staff member can read their own performance', async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/performance/doctor/doctor-1')
        .set(asUser(doctor))
        .expect(200);
    });

    it("a staff member cannot read another's performance", async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/performance/doctor/doctor-2')
        .set(asUser(doctor))
        .expect(403);
      expect(service.getDoctorPerformance).not.toHaveBeenCalled();
    });

    it("HR cannot read another's performance", async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/performance/doctor/doctor-2')
        .set(asUser(hr))
        .expect(403);
    });

    it("admins can read anyone's performance", async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/performance/doctor/doctor-2')
        .set(asUser(admin))
        .expect(200);
    });

    it("a staff member cannot read another's education credits", async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/education/doctor/doctor-2')
        .set(asUser(doctor))
        .expect(403);
    });
  });

  describe('tenant scoping', () => {
    it('rejects requests targeting another tenant', async () => {
      await request(staffApp.getHttpServer())
        .get('/medical-staff/doctors')
        .set(asUser(admin, OTHER_TENANT))
        .expect(403);
      expect(service.findAllDoctors).not.toHaveBeenCalled();
    });

    it('rejects ward rosters for another tenant', async () => {
      await request(wardsApp.getHttpServer())
        .get('/wards/ward-1/shifts')
        .set(asUser(nurse, OTHER_TENANT))
        .expect(403);
    });
  });
});
