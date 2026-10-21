import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseFilters,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  Headers,
  ConflictException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Response } from 'express';
import { FhirService } from '../services/fhir.service';
import { BulkExportService } from '../services/bulk-export.service';
import { FhirExceptionFilter } from '../filters/fhir-exception.filter';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BulkExportQueryDto } from '../dto/bulk-export.dto';
import { FhirOperationOutcome } from '../dto/fhir-resources.dto';
import { ExportScope } from '../entities/bulk-export-job.entity';

@ApiTags('FHIR R4')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('fhir/r4')
@UseFilters(FhirExceptionFilter)
@UseGuards(JwtAuthGuard)
export class FhirController {
  constructor(
    private readonly fhirService: FhirService,
    private readonly bulkExportService: BulkExportService,
  ) {}

  // ── Metadata & Capability ─────────────────────────────────────────────────

  @Get('metadata')
  @ApiOperation({ summary: 'Get FHIR capability statement' })
  getCapabilityStatement() {
    return this.fhirService.getCapabilityStatement();
  }

  // ── Patient Resource ──────────────────────────────────────────────────────

  /**
   * Patient-level export — must be declared before Patient/:id so that
   * the literal "$export" segment is not captured by the :id wildcard.
   * FHIR R4: GET [base]/Patient/$export
   */
  @Get('Patient/$export')
  @ApiOperation({ summary: 'Initiate patient-level bulk export' })
  @ApiResponse({ status: 202, description: 'Export job accepted' })
  async initiateExport(
    @Query() query: BulkExportQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const jobId = await this.bulkExportService.initiateExport(
      req.user.id,
      req.user.role,
      query._type,
      query._since,
      query._outputFormat,
      ExportScope.PATIENT,
    );

    res
      .status(HttpStatus.ACCEPTED)
      .header('Content-Location', `/fhir/r4/$export-status/${jobId}`)
      .send();
  }

  @Get('Patient/:id')
  @ApiOperation({ summary: 'Get a patient resource' })
  @ApiResponse({ status: 200, description: 'Patient resource' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  getPatient(@Param('id') id: string) {
    return this.fhirService.getPatient(id);
  }

  @Put('Patient/:id')
  @ApiOperation({ summary: 'Update a patient resource (create or update with optimistic locking)' })
  @ApiHeader({ name: 'If-Match', description: 'ETag for optimistic locking', required: false })
  @ApiResponse({ status: 200, description: 'Patient updated' })
  @ApiResponse({ status: 201, description: 'Patient created' })
  @ApiResponse({ status: 409, description: 'Version conflict - resource was modified' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async updatePatient(
    @Param('id') id: string,
    @Body() resource: any,
    @Headers('if-match') ifMatch?: string,
    @Req() req?: any,
  ) {
    return this.fhirService.updatePatient(id, resource, ifMatch, req?.user?.id);
  }

  @Patch('Patient/:id')
  @ApiOperation({ summary: 'Patch a patient resource (JSON patch)' })
  @ApiHeader({ name: 'If-Match', description: 'ETag for optimistic locking', required: false })
  @ApiResponse({ status: 200, description: 'Patient patched' })
  @ApiResponse({ status: 409, description: 'Version conflict - resource was modified' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async patchPatient(
    @Param('id') id: string,
    @Body() patches: any[],
    @Headers('if-match') ifMatch?: string,
    @Req() req?: any,
  ) {
    return this.fhirService.patchPatient(id, patches, ifMatch, req?.user?.id);
  }

  @Get('Patient/:id/DocumentReference')
  @ApiOperation({ summary: 'Get patient documents' })
  getPatientDocuments(@Param('id') id: string) {
    return this.fhirService.getPatientDocuments(id);
  }

  // ── DocumentReference Resource ────────────────────────────────────────────

  @Get('DocumentReference/:id')
  @ApiOperation({ summary: 'Get a document reference' })
  @ApiResponse({ status: 200, description: 'DocumentReference resource' })
  @ApiResponse({ status: 404, description: 'DocumentReference not found' })
  getDocumentReference(@Param('id') id: string) {
    return this.fhirService.getDocumentReference(id);
  }

  @Put('DocumentReference/:id')
  @ApiOperation({ summary: 'Update a document reference' })
  @ApiHeader({ name: 'If-Match', description: 'ETag for optimistic locking', required: false })
  @ApiResponse({ status: 200, description: 'DocumentReference updated' })
  @ApiResponse({ status: 409, description: 'Version conflict' })
  async updateDocumentReference(
    @Param('id') id: string,
    @Body() resource: any,
    @Headers('if-match') ifMatch?: string,
    @Req() req?: any,
  ) {
    return this.fhirService.updateDocumentReference(id, resource, ifMatch, req?.user?.id);
  }

  // ── Consent Resource ──────────────────────────────────────────────────────

  @Get('Consent/:id')
  @ApiOperation({ summary: 'Get a consent resource' })
  getConsent(@Param('id') id: string) {
    return this.fhirService.getConsent(id);
  }

  @Put('Consent/:id')
  @ApiOperation({ summary: 'Update a consent resource' })
  @ApiHeader({ name: 'If-Match', description: 'ETag for optimistic locking', required: false })
  async updateConsent(
    @Param('id') id: string,
    @Body() resource: any,
    @Headers('if-match') ifMatch?: string,
    @Req() req?: any,
  ) {
    return this.fhirService.updateConsent(id, resource, ifMatch, req?.user?.id);
  }

  // ── Provenance Resource ───────────────────────────────────────────────────

  @Get('Provenance')
  @ApiOperation({ summary: 'Get provenance records' })
  getProvenance(@Query('target') target?: string) {
    return this.fhirService.getProvenance(target || '');
  }

  // ── Bulk Export (Async Operation) ─────────────────────────────────────────

  /**
   * System-level export — exports ALL resources (admin only).
   * FHIR R4: GET [base]/$export
   */
  @Get('$export')
  @ApiOperation({ summary: 'Initiate system-level FHIR R4 bulk export (admin only)' })
  @ApiResponse({ status: 202, description: 'Export job accepted' })
  async initiateSystemExport(
    @Query() query: BulkExportQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const jobId = await this.bulkExportService.initiateExport(
      req.user.id,
      req.user.role,
      query._type,
      query._since,
      query._outputFormat,
      ExportScope.SYSTEM,
    );

    res
      .status(HttpStatus.ACCEPTED)
      .header('Content-Location', `/fhir/r4/$export-status/${jobId}`)
      .send();
  }

  /**
   * Group-level export — exports resources for a specific FHIR Group.
   * FHIR R4: GET [base]/Group/[id]/$export
   */
  @Get('Group/:groupId/$export')
  @ApiOperation({ summary: 'Initiate group-level FHIR R4 bulk export' })
  @ApiResponse({ status: 202, description: 'Export job accepted' })
  async initiateGroupExport(
    @Param('groupId') groupId: string,
    @Query() query: BulkExportQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const jobId = await this.bulkExportService.initiateExport(
      req.user.id,
      req.user.role,
      query._type,
      query._since,
      query._outputFormat,
      ExportScope.GROUP,
      groupId,
    );

    res
      .status(HttpStatus.ACCEPTED)
      .header('Content-Location', `/fhir/r4/$export-status/${jobId}`)
      .send();
  }

  @Get('$export-status/:jobId')
  @ApiOperation({ summary: 'Get bulk export job status' })
  async getExportStatus(@Param('jobId') jobId: string, @Req() req: any) {
    return this.bulkExportService.getJobStatus(jobId, req.user.id, req.user.role);
  }

  @Delete('$export-status/:jobId')
  @ApiOperation({ summary: 'Cancel a bulk export job' })
  async cancelExport(
    @Param('jobId') jobId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    await this.bulkExportService.cancelJob(jobId, req.user.id, req.user.role);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  // ── Resource Conversion ────────────────────────────────────────────────────

  @Post('convert/:resourceType')
  @ApiOperation({ summary: 'Convert internal entity to FHIR resource' })
  @ApiResponse({ status: 200, description: 'Conversion successful' })
  @ApiResponse({ status: 400, description: 'Mapping validation failed' })
  convertToFhir(@Param('resourceType') resourceType: string, @Body() entity: any) {
    return this.fhirService.convertToFhir(resourceType, entity);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import FHIR resource to internal entity' })
  @ApiResponse({ status: 200, description: 'Import successful' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  importFromFhir(@Body() resource: any) {
    return this.fhirService.convertFromFhir(resource);
  }
}
