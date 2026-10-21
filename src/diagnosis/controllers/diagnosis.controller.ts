import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { JwtPayload } from '../../auth/services/auth-token.service';
import { DiagnosisService } from '../services/diagnosis.service';
import { Icd11Service, Icd11SearchResultDto } from '../services/icd11.service';
import {
  CreateDiagnosisDto,
  UpdateDiagnosisDto,
  SearchDiagnosisDto,
  DiagnosisResponseDto,
} from '../dto/diagnosis.dto';

const WRITE_ROLES = [UserRole.ADMIN, UserRole.PHYSICIAN];
const READ_ROLES = [UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.SURGEON, UserRole.PATIENT];

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
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a new diagnosis' })
  @ApiResponse({
    status: 201,
    description: 'Diagnosis created successfully',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() createDiagnosisDto: CreateDiagnosisDto, @Req() req: { user: JwtPayload }) {
    return await this.diagnosisService.create(createDiagnosisDto, req.user.userId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get diagnosis by ID' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis found',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async findById(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    const diagnosis = await this.diagnosisService.findById(id);
    this.assertPatientAccess(req.user, diagnosis.patientId);
    return diagnosis;
  }

  @Get('patient/:patientId')
  @Roles(...READ_ROLES)
  // Patient-scoped diagnosis list endpoint.
  @ApiOperation({ summary: 'Get all diagnoses for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Patient diagnoses retrieved',
    type: [DiagnosisResponseDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findByPatientId(@Param('patientId') patientId: string, @Req() req: { user: JwtPayload }) {
    this.assertPatientAccess(req.user, patientId);
    return await this.diagnosisService.findByPatientId(patientId);
  }

  @Get('patient/:patientId/active')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get active diagnoses for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Active diagnoses retrieved',
    type: [DiagnosisResponseDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getActiveDiagnoses(@Param('patientId') patientId: string, @Req() req: { user: JwtPayload }) {
    this.assertPatientAccess(req.user, patientId);
    return await this.diagnosisService.getPatientActiveDiagnoses(patientId);
  }

  @Get('patient/:patientId/chronic')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get chronic conditions for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chronic conditions retrieved',
    type: [DiagnosisResponseDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getChronicConditions(@Param('patientId') patientId: string, @Req() req: { user: JwtPayload }) {
    this.assertPatientAccess(req.user, patientId);
    return await this.diagnosisService.getPatientChronicConditions(patientId);
  }

  @Get('patient/:patientId/treatment-plans')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get patient diagnoses with associated treatment plans' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getPatientDiagnosesWithTreatmentPlans(@Param('patientId') patientId: string, @Req() req: { user: JwtPayload }) {
    this.assertPatientAccess(req.user, patientId);
    return await this.diagnosisService.getPatientDiagnosesWithTreatmentPlans(patientId);
  }

  @Get(':id/history')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get diagnosis change history' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis history retrieved',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getDiagnosisHistory(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    const diagnosis = await this.diagnosisService.findById(id);
    this.assertPatientAccess(req.user, diagnosis.patientId);
    return await this.diagnosisService.getDiagnosisHistory(id);
  }

  @Get(':id/treatment-plans')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get treatment plans associated with this diagnosis' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getTreatmentPlansForDiagnosis(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    const diagnosis = await this.diagnosisService.findById(id);
    this.assertPatientAccess(req.user, diagnosis.patientId);
    return await this.diagnosisService.getTreatmentPlansForDiagnosis(id);
  }

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Search diagnoses' })
  @ApiResponse({
    status: 200,
    description: 'Diagnoses found',
    type: [DiagnosisResponseDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async search(@Query() searchDto: SearchDiagnosisDto, @Req() req: { user: JwtPayload }) {
    if (req.user.role === UserRole.PATIENT) {
      this.assertPatientAccess(req.user, searchDto.patientId ?? req.user.userId);
      searchDto.patientId = req.user.userId;
    }
    return await this.diagnosisService.search(searchDto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a diagnosis' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Diagnosis updated successfully',
    type: DiagnosisResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDiagnosisDto: UpdateDiagnosisDto,
    @Req() req: { user: JwtPayload },
  ) {
    return await this.diagnosisService.update(id, updateDiagnosisDto, req.user.userId);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a diagnosis' })
  @ApiParam({ name: 'id', description: 'Diagnosis UUID' })
  @ApiResponse({ status: 204, description: 'Diagnosis deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Diagnosis not found' })
  async delete(@Param('id') id: string) {
    await this.diagnosisService.delete(id);
  }

  private assertPatientAccess(user: JwtPayload, patientId: string): void {
    if (user.role === UserRole.PATIENT && user.userId !== patientId) {
      throw new ForbiddenException('Patients can only access their own diagnoses');
    }
  }
}
