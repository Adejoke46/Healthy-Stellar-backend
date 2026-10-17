import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from '../auth/auth.module';

import { ProjectionCheckpoint } from './checkpoint/projection-checkpoint.entity';
import { CheckpointService } from './checkpoint/checkpoint.service';

import { RecordProjector } from './projectors/record.projector';
import { AccessGrantProjector } from './projectors/access-grant.projector';
import { AuditProjector } from './projectors/audit.projector';
import { AnalyticsProjector } from './projectors/analytics.projector';

import { ProjectionRebuildService } from './rebuild/projection-rebuild.service';
import { ProjectionRebuildProcessor } from './rebuild/projection-rebuild.processor';
import { ProjectionDlqProcessor } from './rebuild/projection-dlq.processor';
import { ProjectionsAdminController } from './projections-admin.controller';

// Read-model entities for the CQRS projection system
import { MedicalRecordReadModel } from './entities/medical-record-read.entity';
import { AccessGrantReadModel } from './entities/access-grant-read.entity';
import { AuditLogProjection } from './entities/audit-log-projection.entity';
import { AnalyticsSnapshot } from './entities/analytics-snapshot.entity';

@Module({
  imports: [
    AuthModule,
    CqrsModule,
    TypeOrmModule.forFeature([
      ProjectionCheckpoint,
      MedicalRecordReadModel,
      AccessGrantReadModel,
      AuditLogProjection,
      AnalyticsSnapshot,
    ]),
    BullModule.registerQueue({ name: 'projection-rebuild' }, { name: 'projection-dlq' }),
  ],
  controllers: [ProjectionsAdminController],
  providers: [
    CheckpointService,
    RecordProjector,
    AccessGrantProjector,
    AuditProjector,
    AnalyticsProjector,
    ProjectionRebuildService,
    ProjectionRebuildProcessor,
    ProjectionDlqProcessor,
  ],
  exports: [CheckpointService, ProjectionRebuildService],
})
export class ProjectionsModule { }
