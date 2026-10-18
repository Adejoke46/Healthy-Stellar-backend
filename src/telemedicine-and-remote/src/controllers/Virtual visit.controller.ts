import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { VirtualVisitService } from '../services/virtual-visit.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../../auth/entities/user.entity';
import { TenantGuard } from '../../../tenant/guards/tenant.guard';

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
const PROVIDER_ROLES = [UserRole.PHYSICIAN, UserRole.NURSE, UserRole.SURGEON];

@ApiTags('telemedicine/virtual-visits')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(...ADMIN_ROLES, ...PROVIDER_ROLES, UserRole.PATIENT)
@Controller('telemedicine/virtual-visits')
export class VirtualVisitController {
  constructor(private readonly virtualVisitService: VirtualVisitService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createVisit(@Body() createDto: any, @Req() req: any) {
    const user = req.user;
    if (user.role === UserRole.PATIENT && createDto?.patientId !== user.userId) {
      throw new ForbiddenException('Patients may only book visits for themselves');
    }
    if (PROVIDER_ROLES.includes(user.role) && createDto?.providerId !== user.userId) {
      throw new ForbiddenException('Providers may only create visits they are assigned to');
    }
    return this.virtualVisitService.createVirtualVisit(createDto);
  }

  @Post(':id/start')
  @Roles(...PROVIDER_ROLES)
  async startVisit(@Param('id') visitId: string, @Req() req: any) {
    await this.assertAssignedProvider(visitId, req);
    return this.virtualVisitService.startVirtualVisit(visitId, req.user.userId);
  }

  @Post(':id/complete')
  @Roles(...PROVIDER_ROLES)
  async completeVisit(
    @Param('id') visitId: string,
    @Body() body: { notes: string },
    @Req() req: any,
  ) {
    await this.assertAssignedProvider(visitId, req);
    return this.virtualVisitService.completeVirtualVisit(visitId, req.user.userId, body?.notes);
  }

  @Post(':id/cancel')
  async cancelVisit(
    @Param('id') visitId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    await this.assertParticipantOrAdmin(visitId, req);
    return this.virtualVisitService.cancelVirtualVisit(visitId, req.user.userId, body?.reason);
  }

  @Put(':id')
  @Roles(...ADMIN_ROLES, ...PROVIDER_ROLES)
  async updateVisit(@Param('id') visitId: string, @Body() updateDto: any, @Req() req: any) {
    await this.assertParticipantOrAdmin(visitId, req);
    return this.virtualVisitService.updateVirtualVisit(visitId, updateDto);
  }

  @Get(':id')
  async getVisit(@Param('id') visitId: string, @Req() req: any) {
    return this.assertParticipantOrAdmin(visitId, req);
  }

  @Get('patient/:patientId')
  async getPatientVisits(
    @Param('patientId') patientId: string,
    @Req() req: any,
    @Query('limit') limit?: number,
  ) {
    const user = req.user;
    if (user.role === UserRole.PATIENT && user.userId !== patientId) {
      throw new ForbiddenException('Patients may only view their own visits');
    }
    const visits = await this.virtualVisitService.findByPatient(patientId, limit);
    // Providers only see the visits of this patient that they participate in.
    if (PROVIDER_ROLES.includes(user.role)) {
      return visits.filter((visit) => visit.providerId === user.userId);
    }
    return visits;
  }

  @Get('provider/:providerId')
  @Roles(...ADMIN_ROLES, ...PROVIDER_ROLES)
  async getProviderVisits(
    @Param('providerId') providerId: string,
    @Req() req: any,
    @Query('date') date?: string,
  ) {
    this.assertSelfOrAdmin(req, providerId);
    const queryDate = date ? new Date(date) : undefined;
    return this.virtualVisitService.findByProvider(providerId, queryDate);
  }

  @Get('provider/:providerId/upcoming')
  @Roles(...ADMIN_ROLES, ...PROVIDER_ROLES)
  async getUpcomingVisits(@Param('providerId') providerId: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, providerId);
    return this.virtualVisitService.getUpcomingVisits(providerId);
  }

  @Post(':id/vital-signs')
  async recordVitalSigns(@Param('id') visitId: string, @Body() vitalSigns: any, @Req() req: any) {
    await this.assertParticipantOrAdmin(visitId, req);
    return this.virtualVisitService.recordVitalSigns(visitId, vitalSigns);
  }

  @Post(':id/technical-issue')
  async reportTechnicalIssue(@Param('id') visitId: string, @Body() issues: any, @Req() req: any) {
    await this.assertParticipantOrAdmin(visitId, req);
    return this.virtualVisitService.reportTechnicalIssue(visitId, issues);
  }

  @Get('provider/:providerId/statistics')
  @Roles(...ADMIN_ROLES, ...PROVIDER_ROLES)
  async getStatistics(
    @Param('providerId') providerId: string,
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    this.assertSelfOrAdmin(req, providerId);
    return this.virtualVisitService.getVisitStatistics(
      providerId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  /** Loads the visit and ensures the caller is its patient, its provider, or an admin. */
  private async assertParticipantOrAdmin(visitId: string, req: any) {
    const user = req.user;
    const visit = await this.virtualVisitService.findOne(visitId);
    if (ADMIN_ROLES.includes(user.role)) return visit;
    if (visit.patientId === user.userId || visit.providerId === user.userId) return visit;
    throw new ForbiddenException('You do not participate in this visit');
  }

  /** Only the provider assigned to the visit may start or complete it. */
  private async assertAssignedProvider(visitId: string, req: any) {
    const visit = await this.virtualVisitService.findOne(visitId);
    if (visit.providerId !== req.user.userId) {
      throw new ForbiddenException('Only the assigned provider may perform this action');
    }
    return visit;
  }

  private assertSelfOrAdmin(req: any, providerId: string): void {
    const user = req.user;
    if (ADMIN_ROLES.includes(user.role)) return;
    if (user.userId === providerId) return;
    throw new ForbiddenException('You may only access your own schedule and statistics');
  }
}
