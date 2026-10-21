import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { TenantGuard } from '../../tenant/guards/tenant.guard';
import { SubscriptionService } from '../services/subscription.service';
import {
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  CreatePatientSubscriptionDto,
  UpdatePatientSubscriptionDto,
  ChangeSubscriptionPlanDto,
  SubscriptionSearchDto,
} from '../dto/subscription.dto';

/** Roles allowed to manage plans and any patient's subscriptions. */
const BILLING_ROLES = [UserRole.ADMIN, UserRole.BILLING_STAFF];

@ApiTags('Billing Subscriptions')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(...BILLING_ROLES)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Subscription Plan Endpoints

  @Post('plans')
  async createPlan(@Body() createDto: CreateSubscriptionPlanDto) {
    return this.subscriptionService.createPlan(createDto);
  }

  @Get('plans')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async getAllPlans(@Query('activeOnly') activeOnly?: string) {
    return this.subscriptionService.getAllPlans(activeOnly === 'true');
  }

  @Get('plans/:id')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async getPlan(@Param('id') id: string) {
    return this.subscriptionService.findPlanById(id);
  }

  @Put('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() updateDto: UpdateSubscriptionPlanDto) {
    return this.subscriptionService.updatePlan(id, updateDto);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlan(@Param('id') id: string) {
    return this.subscriptionService.deletePlan(id);
  }

  // Patient Subscription Endpoints

  @Post('patient')
  async createSubscription(@Body() createDto: CreatePatientSubscriptionDto) {
    return this.subscriptionService.createSubscription(createDto);
  }

  @Get('patient/:patientId')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async getPatientSubscriptions(@Param('patientId') patientId: string, @Req() req: any) {
    this.assertCanAccessPatient(req, patientId);
    return this.subscriptionService.findSubscriptionByPatient(patientId);
  }

  @Get('patient/:patientId/active')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async getActivePatientSubscription(@Param('patientId') patientId: string, @Req() req: any) {
    this.assertCanAccessPatient(req, patientId);
    return this.subscriptionService.findActiveSubscriptionByPatient(patientId);
  }

  @Get(':id')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async getSubscription(@Param('id') id: string, @Req() req: any) {
    const subscription = await this.subscriptionService.findSubscriptionById(id);
    this.assertCanAccessPatient(req, subscription.patientId);
    return subscription;
  }

  @Get()
  async searchSubscriptions(@Query() searchDto: SubscriptionSearchDto) {
    return this.subscriptionService.searchSubscriptions(searchDto);
  }

  @Put(':id')
  async updateSubscription(
    @Param('id') id: string,
    @Body() updateDto: UpdatePatientSubscriptionDto,
  ) {
    return this.subscriptionService.updateSubscription(id, updateDto);
  }

  @Put(':id/plan')
  async changeSubscriptionPlan(
    @Param('id') id: string,
    @Body() changeDto: ChangeSubscriptionPlanDto,
  ) {
    return this.subscriptionService.changeSubscriptionPlan(id, changeDto);
  }

  @Post(':id/cancel')
  @Roles(...BILLING_ROLES, UserRole.PATIENT)
  async cancelSubscription(
    @Param('id') id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
    @Body('immediate') immediate?: boolean,
  ) {
    const subscription = await this.subscriptionService.findSubscriptionById(id);
    this.assertCanAccessPatient(req, subscription.patientId);
    return this.subscriptionService.cancelSubscription(id, reason, immediate);
  }

  @Post(':id/suspend')
  async suspendSubscription(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.subscriptionService.suspendSubscription(id, reason);
  }

  @Post(':id/reactivate')
  async reactivateSubscription(@Param('id') id: string) {
    return this.subscriptionService.reactivateSubscription(id);
  }

  /** Patients may only act on their own subscriptions; billing staff may act on any. */
  private assertCanAccessPatient(req: any, patientId: string): void {
    const user = req.user;
    if (user?.role !== UserRole.PATIENT) return;
    if (user.userId && user.userId === patientId) return;
    throw new ForbiddenException('You may only access your own subscriptions');
  }
}
