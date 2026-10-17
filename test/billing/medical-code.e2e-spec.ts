import {
    CanActivate,
    ExecutionContext,
    INestApplication,
    UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuditService } from '../../src/common/audit/audit.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { UserRole } from '../../src/auth/entities/user.entity';
import { MedicalCodeController } from '../../src/billing/controllers/medical-code.controller';
import { MedicalCodeService } from '../../src/billing/services/medical-code.service';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { CodeType } from '../../src/common/enums';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const MEDICAL_CODE_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_CODE_ID = '33333333-3333-4333-8333-333333333333';

class TestJwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const token = request.headers.authorization?.replace('Bearer ', '');
        const roles: Record<string, UserRole> = {
            nurse: UserRole.NURSE,
            billing: UserRole.BILLING_STAFF,
            admin: UserRole.ADMIN,
        };
        const role = roles[token];

        if (!role) {
            throw new UnauthorizedException();
        }

        request.user = { userId: ACTOR_ID, role };
        return true;
    }
}

describe('MedicalCodeController E2E', () => {
    let app: INestApplication;
    const medicalCode = {
        id: MEDICAL_CODE_ID,
        code: '99213',
        codeType: CodeType.CPT,
        description: 'Office visit',
    };
    const medicalCodeService = {
        create: jest.fn(),
        bulkCreate: jest.fn(),
        search: jest.fn(),
        findById: jest.fn(),
        findByCode: jest.fn(),
        getCPTCodesByCategory: jest.fn(),
        getICD10CodesByCategory: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deactivate: jest.fn(),
        validateCodes: jest.fn(),
    };
    const auditService = { log: jest.fn() };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [MedicalCodeController],
            providers: [
                RolesGuard,
                { provide: JwtAuthGuard, useClass: TestJwtAuthGuard },
                { provide: MedicalCodeService, useValue: medicalCodeService },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        medicalCodeService.search.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
        medicalCodeService.create.mockResolvedValue(medicalCode);
        medicalCodeService.bulkCreate.mockResolvedValue([
            medicalCode,
            { ...medicalCode, id: SECOND_CODE_ID, code: '99214' },
        ]);
        medicalCodeService.update.mockResolvedValue(medicalCode);
        medicalCodeService.delete.mockResolvedValue(undefined);
        medicalCodeService.deactivate.mockResolvedValue({ ...medicalCode, isActive: false });
        auditService.log.mockResolvedValue(undefined);
    });

    afterAll(async () => {
        await app.close();
    });

    it('requires authentication for reads', async () => {
        await request(app.getHttpServer()).get('/medical-codes').expect(401);

        await request(app.getHttpServer())
            .get('/medical-codes')
            .set('Authorization', 'Bearer nurse')
            .expect(200);
    });

    it('rejects writes from users without a billing role', async () => {
        await request(app.getHttpServer())
            .post('/medical-codes')
            .set('Authorization', 'Bearer nurse')
            .send(medicalCode)
            .expect(403);

        expect(medicalCodeService.create).not.toHaveBeenCalled();
    });

    it('allows billing staff mutations and audits each changed code', async () => {
        const server = app.getHttpServer();
        const authorization = 'Bearer billing';

        await request(server)
            .post('/medical-codes')
            .set('Authorization', authorization)
            .send(medicalCode)
            .expect(201);

        await request(server)
            .post('/medical-codes/bulk')
            .set('Authorization', authorization)
            .send([medicalCode])
            .expect(201);

        await request(server)
            .put(`/medical-codes/${MEDICAL_CODE_ID}`)
            .set('Authorization', authorization)
            .send({ description: 'Updated office visit' })
            .expect(200);

        await request(server)
            .put(`/medical-codes/${MEDICAL_CODE_ID}/deactivate`)
            .set('Authorization', authorization)
            .expect(200);

        await request(server)
            .delete(`/medical-codes/${MEDICAL_CODE_ID}`)
            .set('Authorization', authorization)
            .expect(204);

        expect(auditService.log).toHaveBeenCalledTimes(6);
        expect(auditService.log).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                actorId: ACTOR_ID,
                action: 'MEDICAL_CODE_CREATED',
                resourceId: MEDICAL_CODE_ID,
                resourceType: 'MEDICAL_CODE',
            }),
        );
        expect(auditService.log).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ action: 'MEDICAL_CODE_BULK_CREATED', resourceId: MEDICAL_CODE_ID }),
        );
        expect(auditService.log).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ action: 'MEDICAL_CODE_BULK_CREATED', resourceId: SECOND_CODE_ID }),
        );
        expect(auditService.log).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ action: 'MEDICAL_CODE_UPDATED', resourceId: MEDICAL_CODE_ID }),
        );
        expect(auditService.log).toHaveBeenNthCalledWith(
            5,
            expect.objectContaining({ action: 'MEDICAL_CODE_DEACTIVATED', resourceId: MEDICAL_CODE_ID }),
        );
        expect(auditService.log).toHaveBeenNthCalledWith(
            6,
            expect.objectContaining({ action: 'MEDICAL_CODE_DELETED', resourceId: MEDICAL_CODE_ID }),
        );
    });
});
