import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';

import { PatientsService } from './patients.service';
import { PatientTimelineService } from './services/patient-timeline.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { SetGeoRestrictionsDto } from './dto/set-geo-restrictions.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { PatientTimelineDto, PatientTimelineResponse } from './dto/patient-timeline.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PatientPrivacyGuard } from './guards/patient-privacy.guard';
import { AdminGuard } from './guards/admin-guard';
import { PatientOwnerGuard } from './guards/patient-owner.guard';
import { GeoRestrictionGuard } from './guards/geo-restriction.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/services/auth-token.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { CurrentUser } from '../common/decorators/audit-context.decorator';
import { PhiAuditInterceptor } from '../common/interceptors/phi-audit.interceptor';

@ApiTags('patients')
@UseInterceptors(PhiAuditInterceptor)
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly timelineService: PatientTimelineService,
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_RECORDS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new patient (registration staff and admin only)' })
  @ApiResponse({ status: 201, description: 'Patient registered' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async createPatient(@Body() dto: CreatePatientDto, @CurrentUser() user: JwtPayload) {
    return this.patientsService.create(dto, user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PatientPrivacyGuard, GeoRestrictionGuard)
  @ApiOperation({ summary: 'Get patient by ID' })
  async getPatientById(@Param('id') id: string) {
    return this.patientsService.findById(id);
  }

  @Get('/admin/all/')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get all patients (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async getPatient(@Query() paginationDto: PaginationDto) {
    return this.patientsService.findAll(paginationDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Search patients' })
  search(@Query('query') q: string) {
    return this.patientsService.search(q);
  }

  /**
   * PATCH /patients/:address/geo-restrictions
   * Set allowed country codes for geo-based access restriction.
   * Empty array removes all restrictions.
   */
  @Patch(':address/geo-restrictions')
  @UseGuards(JwtAuthGuard, PatientPrivacyGuard)
  @ApiOperation({ summary: 'Set geo-restrictions for a patient record' })
  @ApiParam({ name: 'address', description: 'Patient ID (Stellar address)' })
  @ApiResponse({ status: 200, description: 'Geo-restrictions updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async setGeoRestrictions(@Param('address') address: string, @Body() dto: SetGeoRestrictionsDto) {
    return this.patientsService.setGeoRestrictions(address, dto.allowedCountries);
  }

  @Patch(':address/notification-preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Update notification preferences for the authenticated patient' })
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  @ApiResponse({
    status: 400,
    description: 'SMS channel requires a verified phone number',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async updateNotificationPreferences(
    @Param('address') address: string,
    @Body() dto: UpdateNotificationPreferencesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.updateNotificationPreferences(
      address,
      user.userId,
      user.role,
      dto,
    );
  }

  @Post('merge/:sourceId/:targetId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Merge duplicate patient records (admin only)' })
  @ApiResponse({ status: 200, description: 'Patients merged successfully' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @ApiResponse({ status: 409, description: 'Duplicate merge conflict' })
  async mergePatients(@Param('sourceId') sourceId: string, @Param('targetId') targetId: string) {
    return this.patientsService.mergePatients(sourceId, targetId, 'admin', undefined);
  }

  @Post(':id/admit')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Admit a patient (admin only)' })
  async admitPatient(@Param('id') id: string) {
    return this.patientsService.admit(id);
  }

  /**
   * -----------------------------
   * Patient Update Photo URL
   * -----------------------------
   * - ONLY ADMIN CAN ADMIT A Patient
   */

  /**
   * -----------------------------
   * Update Patient Profile (off-chain metadata)
   * -----------------------------
   * - Patient can only update their own profile
   * - stellarAddress and nationalIdHash are immutable (not in DTO)
   */
  @Patch(':address/profile')
  @UseGuards(JwtAuthGuard, PatientOwnerGuard)
  async updateProfile(@Param('address') address: string, @Body() dto: UpdatePatientProfileDto) {
    return this.patientsService.updateProfile(address, dto);
  }

  /**
   * GET /patients/:address/timeline
   * Get chronological timeline of all events for a patient
   * Events include: records created/updated, access grants/revokes, profile updates
   * Sorted by timestamp descending
   * Patient and admin access only
   */
  @Get(':address/timeline')
  @UseGuards(JwtAuthGuard, PatientPrivacyGuard)
  @ApiOperation({ summary: 'Get patient timeline (chronological events)' })
  @ApiParam({ name: 'address', description: 'Patient Stellar address' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully', type: PatientTimelineResponse })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - patient or admin access only' })
  async getTimeline(
    @Param('address') address: string,
    @Query() query: PatientTimelineDto,
  ): Promise<PatientTimelineResponse> {
    return this.timelineService.getTimeline(address, query.page || 1, query.limit || 20);
  }

  /**
   * -----------------------------
   * Upload Patient Photo
   * -----------------------------
   * - JPG / PNG only
   * - Max 5MB
   * - Stored locally
   */
  @Post(':id/photo')
  @UseGuards(JwtAuthGuard, PatientPrivacyGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/patients/photos',
        filename: (req, file, cb) => {
          const ext = extname(file.originalname);
          cb(null, `patient-${req.params.id}-${Date.now()}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(new BadRequestException('Only JPG and PNG images are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload patient photo' })
  async uploadPatientPhoto(
    @Param('id') patientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return this.patientsService.attachPhoto(patientId, file);
  }
}
