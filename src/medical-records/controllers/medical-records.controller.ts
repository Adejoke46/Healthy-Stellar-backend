import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { MedicalRecordsService } from '../services/medical-records.service';
import { ConsentService } from '../services/consent.service';
import { CreateMedicalRecordDto } from '../dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from '../dto/update-medical-record1.dto';
import { SearchMedicalRecordsDto } from '../dto/search-medical-records.dto';
import { FullTextSearchDto } from '../dto/full-text-search.dto';
import { AuditInterceptor } from '../../common/audit/audit.interceptor';
import { AuditLog } from '../../common/audit/audit-log.decorator';
import { PhiAuditInterceptor } from '../../common/interceptors/phi-audit.interceptor';
import { CurrentTenant } from '@/tenant';
import { CurrentUser } from '../../common/decorators/audit-context.decorator';
import { TenantGuard } from '@/tenant';


@ApiTags('Medical Records')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(TenantGuard)
@UseInterceptors(AuditInterceptor, PhiAuditInterceptor)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(
    private readonly medicalRecordsService: MedicalRecordsService,
    private readonly consentService: ConsentService,
  ) {}

  @Post()
  @AuditLog('WRITE', 'MedicalRecord')
  @ApiOperation({ summary: 'Create a new medical record' })
  @ApiResponse({ status: 201, description: 'Medical record created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @Body() createDto: CreateMedicalRecordDto,
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    const userName = user?.email || 'System';
    return this.medicalRecordsService.create(createDto, userId, userName, tenantId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search medical records' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(
    @Query() searchDto: SearchMedicalRecordsDto,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    return this.medicalRecordsService.search(searchDto, tenantId);
  }

  @Get('search/fulltext')
  @ApiOperation({
    summary: 'Full-text search with relevance ranking',
    description:
      'Searches medical records using PostgreSQL full-text search with ' +
      'ts_rank relevance ordering. Supports phrase search (double-quoted), ' +
      'AND/OR operators, and proximity operators.',
  })
  @ApiResponse({ status: 200, description: 'Full-text search results ordered by relevance' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Full-text search query',
    example: 'hypertension diabetes',
  })
  async searchFulltext(
    @Query() searchDto: FullTextSearchDto,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    return this.medicalRecordsService.searchFulltext(searchDto, tenantId);
  }

  @Get('timeline/:patientId')
  @ApiOperation({ summary: 'Get medical history timeline for a patient' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  async getTimeline(
    @Param('patientId') patientId: string,
    @Query('limit') limit?: number,
    @CurrentTenant('tenantId') tenantId?: string,
  ) {
    return this.medicalRecordsService.getTimeline(patientId, limit || 50, tenantId);
  }

  @Get(':id')
  @AuditLog('READ', 'MedicalRecord')
  @ApiOperation({ summary: 'Get a medical record by ID' })
  @ApiResponse({ status: 200, description: 'Medical record retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Medical record not found' })
  @ApiResponse({ status: 403, description: 'Access denied - no consent or access grant for this record' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query('patientId') patientId?: string,
  ) {
    const record = await this.medicalRecordsService.findOne(id, patientId, tenantId);

    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    const recordPatientId = patientId || record?.patientId;

    await this.assertRecordAccess(id, recordPatientId, userId, tenantId);

    if (recordPatientId) {
      await this.medicalRecordsService.recordView(id, recordPatientId, userId, user?.email);
    }

    return record;
  }

  /**
   * Enforces access control for direct medical record reads.
   * Access is granted when the requester is the patient who owns the record,
   * a provider holding an active access grant, or when valid consent exists
   * for the specific record (reusing ConsentService.checkConsent()).
   */
  private async assertRecordAccess(
    recordId: string,
    patientId: string | undefined,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    if (!patientId) {
      throw new ForbiddenException('Access denied: unable to determine record ownership');
    }

    // The patient who owns the record may always read it.
    if (userId === patientId) {
      return;
    }

    // Reuse the existing consent model: an active consent or access grant
    // for this specific record authorizes the read.
    const consent = await this.consentService.checkConsent(patientId, userId, recordId, tenantId);
    if (consent?.hasConsent) {
      return;
    }

    throw new ForbiddenException('Access denied: no consent or access grant for this record');
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get version history for a medical record' })
  @ApiResponse({ status: 200, description: 'Version history retrieved successfully' })
  async getVersions(
    @Param('id') id: string,
    @CurrentTenant('tenantId') tenantId?: string,
  ) {
    return this.medicalRecordsService.getVersions(id, tenantId);
  }

  @Put(':id')
  @AuditLog('WRITE', 'MedicalRecord')
  @ApiOperation({ summary: 'Update a medical record' })
  @ApiResponse({ status: 200, description: 'Medical record updated successfully' })
  @ApiResponse({ status: 404, description: 'Medical record not found' })
  @ApiResponse({ status: 409, description: 'Version conflict - record was modified by another user, refresh and retry' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateMedicalRecordDto,
    @CurrentUser() user: any,
    @CurrentTenant('tenantId') tenantId?: string,
    @Query('changeReason') changeReason?: string,
  ) {
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    const userName = user?.email || 'System';
    return this.medicalRecordsService.update(id, updateDto, userId, userName, changeReason, tenantId);
  }

  @Put(':id/archive')
  @AuditLog('WRITE', 'MedicalRecord')
  @ApiOperation({ summary: 'Archive a medical record' })
  @ApiResponse({ status: 200, description: 'Medical record archived successfully' })
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentTenant('tenantId') tenantId?: string,
  ) {
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    return this.medicalRecordsService.archive(id, userId, user?.email, tenantId);
  }

  @Put(':id/restore')
  @AuditLog('WRITE', 'MedicalRecord')
  @ApiOperation({ summary: 'Restore an archived medical record' })
  @ApiResponse({ status: 200, description: 'Medical record restored successfully' })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    return this.medicalRecordsService.restore(id, userId, user?.email, tenantId);
  }

  @Delete(':id')
  @AuditLog('DELETE', 'MedicalRecord')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a medical record (soft delete)' })
  @ApiResponse({ status: 204, description: 'Medical record deleted successfully' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    await this.medicalRecordsService.delete(id, userId, user?.email, tenantId);
  }
}
