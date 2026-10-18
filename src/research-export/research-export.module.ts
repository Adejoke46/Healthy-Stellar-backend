import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalRecord } from '../medical-records/entities/medical-record.entity';
import { Patient } from '../patients/entities/patient.entity';
import { AccessGrant } from '../access-control/entities/access-grant.entity';
import { ExportConsentMapping } from './entities/export-consent-mapping.entity';
import { AuditModule } from '../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { MedicalRbacModule } from '../roles/medical-rbac.module';
import { ResearchExportController } from './research-export.controller';
import { ResearchExportService } from './research-export.service';
import { ResearchAnonymizerService } from './research-anonymizer.service';
import { ConsentRevocationService } from './services/consent-revocation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MedicalRecord, Patient, AccessGrant, ExportConsentMapping]),
    AuditModule,
    AuthModule,
    MedicalRbacModule,
  ],
  controllers: [ResearchExportController],
  providers: [ResearchExportService, ResearchAnonymizerService, ConsentRevocationService],
  exports: [ResearchExportService, ResearchAnonymizerService, ConsentRevocationService],
})
export class ResearchExportModule {}
