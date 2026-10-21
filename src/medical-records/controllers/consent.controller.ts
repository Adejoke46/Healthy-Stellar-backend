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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { ConsentService } from '../services/consent.service';
import { MedicalRecordsService } from '../services/medical-records.service';
import { CreateConsentDto } from '../dto/create-consent.dto';
import { ConsentType } from '../entities/medical-record-consent.entity';
import { TenantContext } from '../../tenant/context/tenant.context';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Consent Management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consents')
export class ConsentController {
  constructor(
    private readonly consentService: ConsentService,
    private readonly medicalRecordsService: MedicalRecordsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new consent' })
  @ApiResponse({ status: 201, description: 'Consent created successfully' })
  async create(@Body() createDto: CreateConsentDto, @Req() req: any) {
    const organizationId = TenantContext.getTenantId();
    const record = await this.medicalRecordsService.findOne(createDto.recordId, undefined, organizationId);
    const patientId = record.patientId;
    const callerId: string = req.user.id;
    if (
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPER_ADMIN &&
      callerId !== patientId
    ) {
      throw new ForbiddenException('You may only grant consent for your own records');
    }
    return this.consentService.create(createDto, patientId, callerId);
  }

  @Get('record/:recordId')
  @ApiOperation({ summary: 'Get all consents for a medical record' })
  @ApiResponse({ status: 200, description: 'Consents retrieved successfully' })
  async findByRecord(@Param('recordId') recordId: string) {
    return this.consentService.findByRecord(recordId);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all consents for a patient' })
  @ApiResponse({ status: 200, description: 'Consents retrieved successfully' })
  async findByPatient(@Param('patientId') patientId: string) {
    return this.consentService.findByPatient(patientId);
  }

  @Get('check')
  @ApiOperation({ summary: 'Check consent for the authenticated caller' })
  @ApiResponse({ status: 200, description: 'Consent check result' })
  async checkConsent(
    @Query('recordId') recordId: string,
    @Query('consentType') consentType: ConsentType,
    @Req() req: any,
  ) {
    const hasConsent = await this.consentService.checkConsent(recordId, req.user.id, consentType);
    return { hasConsent };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a consent by ID' })
  @ApiResponse({ status: 200, description: 'Consent retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Consent not found' })
  async findOne(@Param('id') id: string) {
    return this.consentService.findOne(id);
  }

  @Put(':id/revoke')
  @ApiOperation({ summary: 'Revoke a consent' })
  @ApiResponse({ status: 200, description: 'Consent revoked successfully' })
  async revoke(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    const callerId: string = req.user.id;
    const consent = await this.consentService.findOne(id);
    if (
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPER_ADMIN &&
      consent.patientId !== callerId
    ) {
      throw new ForbiddenException('You may only revoke consent for your own records');
    }
    return this.consentService.revoke(id, callerId, reason);
  }
}
