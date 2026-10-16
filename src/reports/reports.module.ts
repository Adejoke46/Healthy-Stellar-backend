import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportJob } from './entities/report-job.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportsService } from './reports.service';
import { ReportScheduleService } from './report-schedule.service';
import { ReportsController } from './reports.controller';
import {
  ReportScheduleController,
  ReportScheduleUnsubscribeController,
} from './report-schedule.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportJob, ReportSchedule]),
    ScheduleModule.forRoot(),
    NotificationsModule,
    AuthModule,
  ],
  // ReportScheduleUnsubscribeController must precede ReportScheduleController so
  // GET /admin/report-schedules/unsubscribe is matched before GET /:id.
  controllers: [ReportsController, ReportScheduleUnsubscribeController, ReportScheduleController],
  providers: [ReportsService, ReportScheduleService],
  exports: [ReportsService, ReportScheduleService],
})
export class ReportsModule {}
