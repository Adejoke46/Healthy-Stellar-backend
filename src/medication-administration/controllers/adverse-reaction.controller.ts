import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { AdverseReactionService } from '../services/adverse-reaction.service';
import { CreateAdverseReactionDto } from '../dto/create-adverse-reaction.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { ReactionSeverity } from '../entities/adverse-drug-reaction.entity';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('adverse-reactions')
@Controller('adverse-reactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdverseReactionController {
  constructor(private readonly adverseReactionService: AdverseReactionService) {}

  @Post()
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN, UserRole.PHARMACIST)
  create(@Body() createAdverseReactionDto: CreateAdverseReactionDto) {
    return this.adverseReactionService.create(createAdverseReactionDto);
  }

  @Get()
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN, UserRole.PHARMACIST, UserRole.ADMIN)
  findAll() {
    return this.adverseReactionService.findAll();
  }

  @Get('patient/:patientId')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN, UserRole.ADMIN)
  findByPatient(@Param('patientId') patientId: string) {
    return this.adverseReactionService.findByPatient(patientId);
  }

  @Get('medication/:medicationName')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  findByMedication(@Param('medicationName') medicationName: string) {
    return this.adverseReactionService.findByMedication(medicationName);
  }

  @Get('severity/:severity')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN, UserRole.ADMIN)
  findBySeverity(@Param('severity') severity: ReactionSeverity) {
    return this.adverseReactionService.findBySeverity(severity);
  }

  @Get('active')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  findActiveReactions() {
    return this.adverseReactionService.findActiveReactions();
  }

  @Get('patient/:patientId/allergies')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  getPatientAllergies(@Param('patientId') patientId: string) {
    return this.adverseReactionService.getPatientAllergies(patientId);
  }

  @Get('stats')
  @Roles(UserRole.PHYSICIAN, UserRole.ADMIN)
  getReactionStats(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.adverseReactionService.getReactionStats(startDate, endDate);
  }

  @Get(':id')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  findOne(@Param('id') id: string) {
    return this.adverseReactionService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  update(@Param('id') id: string, @Body() updateData: any) {
    return this.adverseReactionService.update(id, updateData);
  }

  @Post(':id/notify-physician')
  @Roles(UserRole.NURSE)
  notifyPhysician(@Param('id') id: string) {
    return this.adverseReactionService.notifyPhysician(id);
  }

  @Post(':id/notify-pharmacy')
  @Roles(UserRole.NURSE, UserRole.PHYSICIAN)
  notifyPharmacy(@Param('id') id: string) {
    return this.adverseReactionService.notifyPharmacy(id);
  }

  @Post(':id/discontinue-medication')
  @Roles(UserRole.PHYSICIAN)
  discontinueMedication(@Param('id') id: string) {
    return this.adverseReactionService.discontinueMedication(id);
  }

  @Post(':id/report-fda')
  @Roles(UserRole.PHYSICIAN, UserRole.ADMIN)
  reportToFDA(@Param('id') id: string, @Body() reportData: { reportNumber: string }) {
    return this.adverseReactionService.reportToFDA(id, reportData.reportNumber);
  }

  @Post(':id/resolve')
  @Roles(UserRole.PHYSICIAN)
  resolveReaction(@Param('id') id: string, @Body() resolveData: { outcome: string }) {
    return this.adverseReactionService.resolveReaction(id, resolveData.outcome);
  }
}
