import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { InfectionControlService } from './infection-control.service';
import { OutbreakAlertsService } from './outbreak-alerts.service';
import { CreateInfectionCaseDto } from './dto/create-infection-case.dto';
import { UpdateInfectionCaseDto } from './dto/update-infection-case.dto';
import { CreateIsolationPrecautionDto } from './dto/create-isolation-precaution.dto';
import { UpdateIsolationPrecautionDto } from './dto/update-isolation-precaution.dto';
import { CreateAntibioticResistanceDto } from './dto/create-antibiotic-resistance.dto';
import { CreateInfectionControlPolicyDto } from './dto/create-infection-control-policy.dto';
import { UpdateInfectionControlPolicyDto } from './dto/update-infection-control-policy.dto';
import { CreateOutbreakIncidentDto } from './dto/create-outbreak-incident.dto';
import { UpdateOutbreakIncidentDto } from './dto/update-outbreak-incident.dto';
import { CreateHandHygieneAuditDto } from './dto/create-hand-hygiene-audit.dto';
import { CreateOutbreakThresholdDto } from './dto/create-outbreak-threshold.dto';
import { UpdateOutbreakThresholdDto } from './dto/update-outbreak-threshold.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('infection-control')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('infection-control')
export class InfectionControlController {
  constructor(
    private readonly infectionControlService: InfectionControlService,
    private readonly outbreakAlertsService: OutbreakAlertsService,
  ) {}


  // Dashboard AC
  @Get('dashboard/missing-precautions')
  getCasesMissingPrecautions() {
    return this.infectionControlService.getCasesMissingPrecautions();
  }

  // Infection Cases
  @Post('cases')
  createInfectionCase(@Body() dto: CreateInfectionCaseDto) {
    return this.infectionControlService.createInfectionCase(dto);
  }

  @Get('cases')
  findAllInfectionCases() {
    return this.infectionControlService.findAllInfectionCases();
  }

  @Get('cases/:id')
  findOneInfectionCase(@Param('id') id: string) {
    return this.infectionControlService.findOneInfectionCase(id);
  }

  @Patch('cases/:id')
  updateInfectionCase(@Param('id') id: string, @Body() dto: UpdateInfectionCaseDto) {
    return this.infectionControlService.updateInfectionCase(id, dto);
  }

  // Isolation Precautions
  @Post('isolation')
  createIsolationPrecaution(@Body() dto: CreateIsolationPrecautionDto) {
    return this.infectionControlService.createIsolationPrecaution(dto);
  }

  @Get('isolation')
  findAllIsolationPrecautions() {
    return this.infectionControlService.findAllIsolationPrecautions();
  }

  @Patch('isolation/:id')
  updateIsolationPrecaution(@Param('id') id: string, @Body() dto: UpdateIsolationPrecautionDto) {
    return this.infectionControlService.updateIsolationPrecaution(id, dto);
  }

  // Antibiotic Resistance
  @Post('resistance')
  createAntibioticResistance(@Body() dto: CreateAntibioticResistanceDto) {
    return this.infectionControlService.createAntibioticResistance(dto);
  }

  @Get('resistance')
  findAllAntibioticResistance() {
    return this.infectionControlService.findAllAntibioticResistance();
  }

  // Policies
  @Post('policies')
  createPolicy(@Body() dto: CreateInfectionControlPolicyDto) {
    return this.infectionControlService.createPolicy(dto);
  }

  @Get('policies')
  findAllPolicies() {
    return this.infectionControlService.findAllPolicies();
  }

  @Patch('policies/:id')
  updatePolicy(@Param('id') id: string, @Body() dto: UpdateInfectionControlPolicyDto) {
    return this.infectionControlService.updatePolicy(id, dto);
  }

  // Outbreaks
  @Post('outbreaks')
  createOutbreak(@Body() dto: CreateOutbreakIncidentDto) {
    return this.infectionControlService.createOutbreak(dto);
  }

  @Get('outbreaks')
  findAllOutbreaks() {
    return this.infectionControlService.findAllOutbreaks();
  }

  @Patch('outbreaks/:id')
  updateOutbreak(@Param('id') id: string, @Body() dto: UpdateOutbreakIncidentDto) {
    return this.infectionControlService.updateOutbreak(id, dto);
  }

  // Hand Hygiene
  @Post('hand-hygiene')
  createHandHygieneAudit(@Body() dto: CreateHandHygieneAuditDto) {
    return this.infectionControlService.createHandHygieneAudit(dto);
  }

  @Get('hand-hygiene')
  findAllHandHygieneAudits() {
    return this.infectionControlService.findAllHandHygieneAudits();
  }

  // Outbreak Thresholds (configuration)
  @Post('outbreak-thresholds')
  createOutbreakThreshold(@Body() dto: CreateOutbreakThresholdDto) {
    return this.outbreakAlertsService.createThreshold(dto);
  }

  @Get('outbreak-thresholds')
  findAllOutbreakThresholds() {
    return this.outbreakAlertsService.findAllThresholds();
  }

  @Get('outbreak-thresholds/:id')
  findOneOutbreakThreshold(@Param('id') id: string) {
    return this.outbreakAlertsService.findOneThreshold(id);
  }

  @Patch('outbreak-thresholds/:id')
  updateOutbreakThreshold(@Param('id') id: string, @Body() dto: UpdateOutbreakThresholdDto) {
    return this.outbreakAlertsService.updateThreshold(id, dto);
  }

  // Outbreak Alerts dashboard
  @Get('outbreak-alerts')
  findActiveOutbreakAlerts() {
    return this.outbreakAlertsService.findActiveAlerts();
  }

  @Patch('outbreak-alerts/:id/resolve')
  resolveOutbreakAlert(@Param('id') id: string) {
    return this.outbreakAlertsService.resolveAlert(id);
  }
}
