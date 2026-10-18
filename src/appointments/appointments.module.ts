import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

// Entities
import { Appointment } from './entities/appointment.entity';
import { DoctorAvailability } from './entities/doctor-availability.entity';
import { ConsultationNote } from './entities/consultation-note.entity';
import { AppointmentReminder } from './entities/appointment-reminder.entity';
import { AppointmentWaitlist } from './entities/appointment-waitlist.entity';
import { Patient } from '../patients/entities/patient.entity';

// Services
import { AppointmentService } from './services/appointment.service';
import { ConsultationService } from './services/consultation.service';
import { ReminderService } from './services/reminder.service';
import { DoctorAvailabilityService } from './services/doctor-availability.service';
import { WaitlistService } from './services/waitlist.service';
import { NotificationsModule } from '../notifications/notifications.module';

// Controllers
import { AppointmentController } from './controllers/appointment.controller';
import { ConsultationController } from './controllers/consultation.controller';
import { DoctorAvailabilityController } from './controllers/doctor-availability.controller';
import { WaitlistController } from './controllers/waitlist.controller';

// Audit logging
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      DoctorAvailability,
      ConsultationNote,
      AppointmentReminder,
      AppointmentWaitlist,
      Patient,
    ]),
    NotificationsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
    AuditModule,
  ],
  controllers: [AppointmentController, ConsultationController, DoctorAvailabilityController, WaitlistController],
  providers: [AppointmentService, ConsultationService, ReminderService, DoctorAvailabilityService, WaitlistService],
  exports: [AppointmentService, ConsultationService, ReminderService, DoctorAvailabilityService, WaitlistService],
})
export class AppointmentsModule {}
