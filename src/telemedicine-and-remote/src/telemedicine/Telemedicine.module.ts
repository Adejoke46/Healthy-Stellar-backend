import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VirtualVisitController } from '../controllers/Virtual visit.controller';
import { RemoteMonitoringController } from '../controllers/remote-monitoring.controller';
import { TelemedicineDocumentationController } from '../controllers/telemedicine-documentation.controller';
import { TelehealthBillingController } from '../controllers/telehealth-billing.controller';
import { RemotePrescriptionController } from '../controllers/remote-prescription.controller';
import { QualityOutcomeController } from '../controllers/quality-outcome.controller';
import { VirtualVisitService } from './services/virtual-visit.service';
import { VideoConferenceService } from '../services/Video conference.service';
import { RemoteMonitoringService } from './services/remote-monitoring.service';
import { TelemedicineDocumentationService } from './services/telemedicine-documentation.service';
import { TelehealthBillingService } from './services/telehealth-billing.service';
import { RemotePrescriptionService } from './services/remote-prescription.service';
import { QualityOutcomeService } from './services/quality-outcome.service';
import { HipaaComplianceService } from './services/hipaa-compliance.service';
import { HipaaAuditLogEntity } from '../entity/hipaa-audit-log.entity';
import { PatientConsentEntity } from '../entity/patient-consent.entity';
import { VirtualVisit } from './entities/virtual-visit.entity';
import { RemoteMonitoringData } from './entities/remote-monitoring-data.entity';
import { TelemedicineDocument } from './entities/telemedicine-document.entity';
import { TelehealthBilling } from './entities/telehealth-billing.entity';
import { RemotePrescription } from './entities/remote-prescription.entity';
import { QualityOutcome } from './entities/quality-outcome.entity';
import { VideoConferenceSession } from '../entity/Video conference session.entity';
import { SessionRecording } from '../entity/session-recording.entity';
import { RecordingService } from '../services/recording.service';
import { RecordingController } from '../controllers/recording.controller';
import { VideoConferenceGateway } from '../gateways/Video conference.gateway';
import { AuthModule } from '../../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VirtualVisit,
      RemoteMonitoringData,
      TelemedicineDocument,
      TelehealthBilling,
      RemotePrescription,
      QualityOutcome,
      VideoConferenceSession,
      SessionRecording,
      HipaaAuditLogEntity,
      PatientConsentEntity,
    ]),
    AuthModule,
  ],
  controllers: [
    VirtualVisitController,
    RemoteMonitoringController,
    TelemedicineDocumentationController,
    TelehealthBillingController,
    RemotePrescriptionController,
    QualityOutcomeController,
    RecordingController,
  ],
  providers: [
    VirtualVisitService,
    VideoConferenceService,
    RemoteMonitoringService,
    TelemedicineDocumentationService,
    TelehealthBillingService,
    RemotePrescriptionService,
    QualityOutcomeService,
    HipaaComplianceService,
    RecordingService,
    VideoConferenceGateway,
  ],
  exports: [VirtualVisitService, RemoteMonitoringService, QualityOutcomeService],
})
export class TelemedicineModule {}
