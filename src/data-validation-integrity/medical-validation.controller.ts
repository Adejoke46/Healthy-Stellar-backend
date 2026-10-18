import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Icd10ValidationService } from './services/icd10-validation.service';
import { CptValidationService } from './services/cpt-validation.service';
import { LoincValidationService } from './services/loinc-validation.service';
import { ClinicalDataQualityService } from './services/clinical-data-quality.service';
import { ClinicalDecisionSupportService } from './services/clinical-decision-support.service';
import { ReferenceDataService } from './services/reference-data.service';
import { DataGovernanceService } from './services/data-governance.service';
import { MedicalMonitoringService } from '../medical-monitoring/medical-monitoring.service';
import {
  ValidateIcd10Dto,
  ValidateCptDto,
  ValidateLoincDto,
  BulkCodeValidationDto,
  ClinicalDataQualityCheckDto,
  MedicalAlertDto,
  DataGovernancePolicyDto,
} from './dto/medical-validation.dto';

@ApiTags('Medical Data Validation')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('medical-validation')
export class MedicalValidationController {
  constructor(
    private readonly icd10Service: Icd10ValidationService,
    private readonly cptService: CptValidationService,
    private readonly loincService: LoincValidationService,
    private readonly dataQualityService: ClinicalDataQualityService,
    private readonly cdsService: ClinicalDecisionSupportService,
    private readonly referenceDataService: ReferenceDataService,
    private readonly governanceService: DataGovernanceService,
    private readonly monitoringService: MedicalMonitoringService,
  ) {}

  // ─── Code Validation ──────────────────────────────────────────────────────

  @Post('codes/icd10/validate')
  @ApiOperation({ summary: 'Validate an ICD-10-CM diagnosis code' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateIcd10(@Body() dto: ValidateIcd10Dto) {
    return this.icd10Service.validate(dto.code, dto.codeYear);
  }

  @Post('codes/cpt/validate')
  @ApiOperation({ summary: 'Validate a CPT procedure code' })
  async validateCpt(@Body() dto: ValidateCptDto) {
    return this.cptService.validate(dto.code, dto.associatedDiagnosisCodes);
  }

  @Post('codes/loinc/validate')
  @ApiOperation({ summary: 'Validate a LOINC lab observation code' })
  async validateLoinc(@Body() dto: ValidateLoincDto) {
    return this.loincService.validate(dto.code, dto.observedValue, dto.unit);
  }

  @Post('codes/bulk-validate')
  @ApiOperation({ summary: 'Bulk validate codes across multiple systems' })
  @HttpCode(HttpStatus.OK)
  async bulkValidate(@Body() dto: BulkCodeValidationDto) {
    const startTime = Date.now();
    const results = {
      icd10: [] as any[],
      cpt: [] as any[],
      loinc: [] as any[],
    };

    await Promise.all([
      ...(dto.icd10Codes || []).map(async (c) => {
        const result = await this.icd10Service.validate(c.code, c.codeYear);
        results.icd10.push(result);
      }),
      ...(dto.cptCodes || []).map(async (c) => {
        const result = await this.cptService.validate(c.code, c.associatedDiagnosisCodes);
        results.cpt.push(result);
      }),
      ...(dto.loincCodes || []).map(async (c) => {
        const result = await this.loincService.validate(c.code, c.observedValue, c.unit);
        results.loinc.push(result);
      }),
    ]);

    const allResults = [...results.icd10, ...results.cpt, ...results.loinc];
    const processingTimeMs = Date.now() - startTime;

    return {
      totalCodes: allResults.length,
      validCount: allResults.filter((r) => r.isValid).length,
      invalidCount: allResults.filter((r) => !r.isValid).length,
      warningCount: allResults.filter((r) => r.warnings.length > 0).length,
      results: allResults,
      processingTimeMs,
    };
  }

  @Get('codes/search')
  @ApiOperation({ summary: 'Search medical codes across registries' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'system', required: false, description: 'Code system (ICD-10, CPT, LOINC)' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  async searchCodes(
    @Query('q') query: string,
    @Query('system') system?: string,
    @Query('activeOnly') activeOnly: boolean = true,
  ) {
    return this.referenceDataService.searchCodes(query, system, activeOnly);
  }

  // ─── Data Quality ─────────────────────────────────────────────────────────

  @Post('data-quality/assess')
  @ApiOperation({ summary: 'Assess clinical data quality for a record' })
  async assessDataQuality(@Body() dto: ClinicalDataQualityCheckDto) {
    return this.dataQualityService.assessQuality(
      dto.recordId,
      dto.recordType,
      dto.data,
      dto.requiredFields,
    );
  }

  @Get('data-quality/trend/:recordType')
  @ApiOperation({ summary: 'Get data quality trend for a record type' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getQualityTrend(@Param('recordType') recordType: string, @Query('days') days: number = 30) {
    return this.dataQualityService.getQualityTrend(recordType, days);
  }

  @Get('data-quality/completeness')
  @ApiOperation({ summary: 'Get data completeness report' })
  @ApiQuery({ name: 'recordType', required: false })
  async getCompletenessReport(@Query('recordType') recordType?: string) {
    return this.monitoringService.getDataCompletenessReport(recordType);
  }

  // ─── Clinical Decision Support ────────────────────────────────────────────

  @Post('clinical-alerts/drug-interactions')
  @ApiOperation({ summary: 'Check for drug-drug interactions' })
  async checkDrugInteractions(@Body() body: { patientId: string; medicationCodes: string[] }) {
    return this.cdsService.checkDrugInteractions(body);
  }

  @Post('clinical-alerts/critical-values')
  @ApiOperation({ summary: 'Check for critical lab values' })
  async checkCriticalValues(
    @Body() body: { patientId: string; loincCode: string; value: number; unit: string },
  ) {
    return this.cdsService.checkCriticalValues(body);
  }

  @Post('clinical-alerts/allergy-check')
  @ApiOperation({ summary: 'Check for allergy contraindications' })
  async checkAllergyContraindications(
    @Body() body: { patientId: string; prescribedNdc: string; allergyList: string[] },
  ) {
    return this.cdsService.checkAllergyContraindications(body);
  }

  @Get('clinical-alerts/:patientId')
  @ApiOperation({ summary: 'Get clinical alerts for a patient' })
  @ApiQuery({ name: 'includeResolved', required: false, type: Boolean })
  async getPatientAlerts(
    @Param('patientId') patientId: string,
    @Query('includeResolved') includeResolved: boolean = false,
  ) {
    return this.cdsService.getPatientAlerts(patientId, includeResolved);
  }

  @Patch('clinical-alerts/:alertId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge/resolve a clinical alert' })
  async acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Body() body: { resolvedBy: string; overrideReason?: string },
  ) {
    return this.cdsService.acknowledgeAlert(alertId, body.resolvedBy, body.overrideReason);
  }

  // ─── Reference Data ───────────────────────────────────────────────────────

  @Get('reference-data/stats')
  @ApiOperation({ summary: 'Get code system statistics' })
  async getReferenceDataStats() {
    return this.referenceDataService.getCodeSystemStats();
  }

  @Get('reference-data/updates')
  @ApiOperation({ summary: 'Get reference data update history' })
  @ApiQuery({ name: 'system', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUpdateHistory(
    @Query('system') system?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.referenceDataService.getUpdateHistory(system, limit);
  }

  @Post('reference-data/bulk-check')
  @ApiOperation({ summary: 'Bulk check if codes exist in registry' })
  async bulkExistenceCheck(@Body() body: { codeSystem: string; codes: string[] }) {
    return this.referenceDataService.bulkExistenceCheck(body.codeSystem, body.codes);
  }

  // ─── Governance ───────────────────────────────────────────────────────────

  @Post('governance/enforce')
  @ApiOperation({ summary: 'Enforce governance policies on a data record' })
  async enforceGovernance(
    @Body()
    body: {
      resourceId: string;
      resourceType: string;
      data: Record<string, unknown>;
      checkedBy?: string;
    },
  ) {
    return this.governanceService.enforceGovernancePolicies(
      body.resourceId,
      body.resourceType,
      body.data,
      body.checkedBy,
    );
  }

  @Post('governance/detect-phi')
  @ApiOperation({ summary: 'Detect unprotected PHI fields in a data record' })
  async detectPhi(@Body() body: { data: Record<string, unknown> }) {
    return this.governanceService.detectUnprotectedPhi(body.data);
  }

  @Post('governance/retention-check')
  @ApiOperation({ summary: 'Check if a record is compliant with retention policy' })
  async checkRetention(@Body() body: { recordType: string; createdAt: string }) {
    return this.governanceService.checkRetentionCompliance(
      body.recordType,
      new Date(body.createdAt),
    );
  }

  @Post('governance/policies')
  @ApiOperation({ summary: 'Create or update a governance policy' })
  async upsertPolicy(@Body() dto: DataGovernancePolicyDto) {
    return this.governanceService.upsertPolicy({
      ...dto,
      effectiveDate: new Date(dto.effectiveDate),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
    });
  }

  @Get('governance/compliance-summary')
  @ApiOperation({ summary: 'Get governance compliance summary' })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getComplianceSummary(
    @Query('resourceType') resourceType?: string,
    @Query('days') days: number = 30,
  ) {
    return this.governanceService.getComplianceSummary(resourceType, days);
  }

  // ─── Monitoring Dashboard ─────────────────────────────────────────────────

  @Get('monitoring/dashboard')
  @ApiOperation({ summary: 'Get medical data monitoring dashboard' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getMonitoringDashboard(@Query('days') days: number = 7) {
    return this.monitoringService.getDashboard(days);
  }
}
