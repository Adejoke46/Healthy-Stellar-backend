import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalStaffService } from './medical-staff.service';
import { MedicalStaffController } from './medical-staff.controller';
import { WardShiftsController } from './ward-shifts.controller';
import { CredentialTrackingController } from './controllers/credential-tracking.controller';
import { Doctor } from './entities/doctor.entity';
import { Department } from './entities/department.entity';
import { Specialty } from './entities/specialty.entity';
import { Schedule } from './entities/schedule.entity';
import { PerformanceMetric } from './entities/performance-metric.entity';
import { ContinuingEducation } from './entities/continuing-education.entity';
import { Shift } from './entities/shift.entity';
import { StaffCredential } from './entities/staff-credential.entity';
import { CredentialTrackingService } from './services/credential-tracking.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Doctor,
      Department,
      Specialty,
      Schedule,
      PerformanceMetric,
      ContinuingEducation,
      Shift,
      StaffCredential,
    ]),
    NotificationsModule,
    AuthModule,
  ],
  controllers: [MedicalStaffController, WardShiftsController, CredentialTrackingController],
  providers: [MedicalStaffService, CredentialTrackingService],
  exports: [MedicalStaffService, CredentialTrackingService],
})
export class MedicalStaffModule {}
