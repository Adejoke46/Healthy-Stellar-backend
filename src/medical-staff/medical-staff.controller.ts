import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { TenantGuard } from '../tenant/guards/tenant.guard';
import { MedicalStaffService } from './medical-staff.service';
import { CreateShiftDto } from './dto/shift.dto';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import {
  CreatePerformanceMetricDto,
  CreateContinuingEducationDto,
} from './dto/create-performance-metric.dto';
import { SpecializationType, StaffStatus } from './entities/doctor.entity';

/** Roles allowed to create or modify staff records (admin / HR). */
export const STAFF_ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_RECORDS];

/** Roles allowed to view staff directory and rosters. */
export const STAFF_READ_ROLES = [
  ...STAFF_ADMIN_ROLES,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.SURGEON,
];

/** Roles allowed to view any staff member's performance / education data. */
const PERFORMANCE_ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

@ApiTags('medical-staff')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('medical-staff')
export class MedicalStaffController {
  constructor(private readonly staffService: MedicalStaffService) {}

  @Post('doctors')
  @Roles(...STAFF_ADMIN_ROLES)
  createDoctor(@Body() dto: CreateDoctorDto) {
    return this.staffService.createDoctor(dto);
  }

  @Get('doctors')
  @Roles(...STAFF_READ_ROLES)
  findAllDoctors(
    @Query('specialization') specialization?: SpecializationType,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: StaffStatus
  ) {
    return this.staffService.findAllDoctors({ specialization, departmentId, status });
  }

  @Get('doctors/:id')
  @Roles(...STAFF_READ_ROLES)
  findDoctorById(@Param('id') id: string) {
    return this.staffService.findDoctorById(id);
  }

  @Put('doctors/:id')
  @Roles(...STAFF_ADMIN_ROLES)
  updateDoctor(@Param('id') id: string, @Body() dto: Partial<CreateDoctorDto>) {
    return this.staffService.updateDoctor(id, dto);
  }

  @Get('licenses/expiring')
  @Roles(...STAFF_ADMIN_ROLES)
  getExpiringLicenses(@Query('days') days?: number) {
    return this.staffService.getExpiringLicenses(days ? Number(days) : 90);
  }

  // ── Shift scheduling ──────────────────────────────────────────────────────

  @Post('shifts')
  @Roles(...STAFF_ADMIN_ROLES)
  createShift(@Body() dto: CreateShiftDto) {
    return this.staffService.createShift(dto);
  }

  /** GET /medical-staff/:id/schedule?week=YYYY-MM-DD */
  @Get(':id/schedule')
  @Roles(...STAFF_READ_ROLES)
  getStaffSchedule(
    @Param('id') id: string,
    @Query('week') week?: string,
  ) {
    return this.staffService.getStaffWeeklySchedule(id, week);
  }

  @Post('schedules')
  @Roles(...STAFF_ADMIN_ROLES)
  createSchedule(@Body() dto: CreateScheduleDto) {
    return this.staffService.createSchedule(dto);
  }

  @Get('schedules/doctor/:doctorId')
  @Roles(...STAFF_READ_ROLES)
  getDoctorSchedule(
    @Param('doctorId') doctorId: string,
    @Query('date') date?: string
  ) {
    return this.staffService.getDoctorSchedule(
      doctorId,
      date ? new Date(date) : undefined
    );
  }

  // ── Performance & continuing education ────────────────────────────────────

  @Post('performance')
  @Roles(...PERFORMANCE_ADMIN_ROLES)
  createPerformanceMetric(@Body() dto: CreatePerformanceMetricDto) {
    return this.staffService.createPerformanceMetric(dto);
  }

  @Get('performance/doctor/:doctorId')
  @Roles(...STAFF_READ_ROLES)
  getDoctorPerformance(
    @Param('doctorId') doctorId: string,
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    this.assertAdminOrSelf(req, doctorId);
    return this.staffService.getDoctorPerformance(
      doctorId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }

  @Post('education')
  @Roles(...STAFF_ADMIN_ROLES)
  addContinuingEducation(@Body() dto: CreateContinuingEducationDto) {
    return this.staffService.addContinuingEducation(dto);
  }

  @Get('education/doctor/:doctorId')
  @Roles(...STAFF_READ_ROLES)
  getDoctorEducationCredits(
    @Param('doctorId') doctorId: string,
    @Req() req: any,
    @Query('year') year?: string,
  ) {
    this.assertAdminOrSelf(req, doctorId);
    return this.staffService.getDoctorEducationCredits(
      doctorId,
      year ? parseInt(year, 10) : undefined,
    );
  }

  /** Performance data is visible only to admins and the staff member themselves. */
  private assertAdminOrSelf(req: any, staffId: string): void {
    const user = req.user;
    if (PERFORMANCE_ADMIN_ROLES.includes(user?.role)) return;
    if (user?.userId && user.userId === staffId) return;
    throw new ForbiddenException('You are not allowed to access this staff member\'s performance data');
  }
}
