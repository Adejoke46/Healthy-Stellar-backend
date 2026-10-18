import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DiagnosisService } from '../services/diagnosis.service';
import { Icd11Service, Icd11SearchResultDto } from '../services/icd11.service';
import {
  CreateDiagnosisDto,
  UpdateDiagnosisDto,
  SearchDiagnosisDto,
  DiagnosisResponseDto,
} from '../dto/diagnosis.dto';

@ApiTags('Diagnosis')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('diagnosis')
export class DiagnosisController {
  constructor(
    private readonly diagnosisService: DiagnosisService,
    private readonly icd11Service: Icd11Service,
  ) {}

  @Get('icd11/search')
  @ApiOperation({ summary: 'Autocomplete ICD-11 codes by keyword (code, title, or synonym)' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search keyword — matched against code, title, and synonyms',
    example: 'diabetes',
  })
  @ApiResponse({
    status: 200,
    description: 'Top 20 ICD-11 matches ranked by relevance',
    type: [Icd11SearchResultDto],
  })
  async searchIcd11(@Query('q') q: string): Promise<Icd11SearchResultDto[]> {
    return this.icd11Service.search(q ?? '');
  }

  @Post()
  @ApiOperation({ summary: 'Create a new diagnosis' })
  @ApiResponse({
    status: 201,
    description: 'Diagnosis created successfully',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createDiagnosisDto: CreateDiagnosisDto) {
    return await this.diagnosisService.create(createDiagnosisDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diagnosis by ID' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis found',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async findById(@Param('id') id: string) {
    return await this.diagnosisService.findById(id);
  }

  @Get('patient/:patientId')
  // Patient-scoped diagnosis list endpoint.
  @ApiOperation({ summary: 'Get all diagnoses for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Patient diagnoses retrieved',
    type: [DiagnosisResponseDto],
  })
  async findByPatientId(@Param('patientId') patientId: string) {
    return await this.diagnosisService.findByPatientId(patientId);
  }

  @Get('patient/:patientId/active')
  @ApiOperation({ summary: 'Get active diagnoses for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Active diagnoses retrieved',
    type: [DiagnosisResponseDto],
  })
  async getActiveDiagnoses(@Param('patientId') patientId: string) {
    return await this.diagnosisService.getPatientActiveDiagnoses(patientId);
  }

  @Get('patient/:patientId/chronic')
  @ApiOperation({ summary: 'Get chronic conditions for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chronic conditions retrieved',
    type: [DiagnosisResponseDto],
  })
  async getChronicConditions(@Param('patientId') patientId: string) {
    return await this.diagnosisService.getPatientChronicConditions(patientId);
  }

  @Get('patient/:patientId/treatment-plans')
  @ApiOperation({ summary: 'Get patient diagnoses with associated treatment plans' })
  async getPatientDiagnosesWithTreatmentPlans(@Param('patientId') patientId: string) {
    return await this.diagnosisService.getPatientDiagnosesWithTreatmentPlans(patientId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get diagnosis change history' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis history retrieved',
  })
  async getDiagnosisHistory(@Param('id') id: string) {
    return await this.diagnosisService.getDiagnosisHistory(id);
  }

  @Get(':id/treatment-plans')
  @ApiOperation({ summary: 'Get treatment plans associated with this diagnosis' })
  async getTreatmentPlansForDiagnosis(@Param('id') id: string) {
    return await this.diagnosisService.getTreatmentPlansForDiagnosis(id);
  }

  @Get()
  @ApiOperation({ summary: 'Search diagnoses' })
  @ApiResponse({
    status: 200,
    description: 'Diagnoses found',
    type: [DiagnosisResponseDto],
  })
  async search(@Query() searchDto: SearchDiagnosisDto) {
    return await this.diagnosisService.search(searchDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a diagnosis' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis updated successfully',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async update(@Param('id') id: string, @Body() updateDiagnosisDto: UpdateDiagnosisDto) {
    return await this.diagnosisService.update(id, updateDiagnosisDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a diagnosis' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({ status: 204, description: 'Diagnosis deleted successfully' })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async delete(@Param('id') id: string) {
    await this.diagnosisService.delete(id);
  }
}
