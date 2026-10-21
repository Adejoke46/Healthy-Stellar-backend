import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { DenialService } from '../services/denial.service';
import {
  CreateDenialDto,
  UpdateDenialDto,
  CreateAppealDto,
  UpdateAppealDto,
  DenialSearchDto,
  AppealSearchDto,
} from '../dto/denial.dto';

@ApiTags('denials')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
@Controller('denials')
export class DenialController {
  constructor(private readonly denialService: DenialService) {}

  @Post()
  @ApiOperation({ summary: 'Create a claim denial record' })
  @ApiResponse({ status: 201, description: 'Denial created successfully' })
  async createDenial(@Body() createDto: CreateDenialDto) {
    return this.denialService.createDenial(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Search denials' })
  @ApiResponse({ status: 200, description: 'Denials retrieved successfully' })
  async searchDenials(@Query() searchDto: DenialSearchDto) {
    return this.denialService.searchDenials(searchDto);
  }

  @Get('upcoming-deadlines')
  @ApiOperation({ summary: 'Get denials with upcoming appeal deadlines' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days to look ahead (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Denials with upcoming deadlines retrieved' })
  async getUpcomingDeadlines(@Query('days') days?: number) {
    return this.denialService.getUpcomingDeadlines(days);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get denial analytics' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({ status: 200, description: 'Analytics retrieved' })
  async getDenialAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.denialService.getDenialAnalytics(new Date(startDate), new Date(endDate));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get denial by ID' })
  @ApiParam({ name: 'id', description: 'Denial ID' })
  @ApiResponse({ status: 200, description: 'Denial retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Denial not found' })
  async findDenialById(@Param('id') id: string) {
    return this.denialService.findDenialById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update denial' })
  @ApiParam({ name: 'id', description: 'Denial ID' })
  @ApiResponse({ status: 200, description: 'Denial updated successfully' })
  async updateDenial(@Param('id') id: string, @Body() updateDto: UpdateDenialDto) {
    return this.denialService.updateDenial(id, updateDto);
  }

  @Post(':id/appeals')
  @ApiOperation({ summary: 'Create an appeal for a denial' })
  @ApiParam({ name: 'id', description: 'Denial ID' })
  @ApiResponse({ status: 201, description: 'Appeal created successfully' })
  async createAppeal(
    @Param('id') id: string,
    @Body() createDto: Omit<CreateAppealDto, 'denialId'>,
  ) {
    return this.denialService.createAppeal({ ...createDto, denialId: id });
  }
}

@ApiTags('appeals')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
@Controller('appeals')
export class AppealController {
  constructor(private readonly denialService: DenialService) {}

  @Get()
  @ApiOperation({ summary: 'Search appeals' })
  @ApiResponse({ status: 200, description: 'Appeals retrieved successfully' })
  async searchAppeals(@Query() searchDto: AppealSearchDto) {
    return this.denialService.searchAppeals(searchDto);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending appeals' })
  @ApiResponse({ status: 200, description: 'Pending appeals retrieved' })
  async getPendingAppeals() {
    return this.denialService.getPendingAppeals();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appeal by ID' })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Appeal not found' })
  async findAppealById(@Param('id') id: string) {
    return this.denialService.findAppealById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update appeal' })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal updated successfully' })
  async updateAppeal(@Param('id') id: string, @Body() updateDto: UpdateAppealDto) {
    return this.denialService.updateAppeal(id, updateDto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit appeal to payer' })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal submitted successfully' })
  async submitAppeal(@Param('id') id: string) {
    return this.denialService.submitAppeal(id);
  }

  @Post(':id/decision')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Process appeal decision from payer' })
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Decision processed successfully' })
  async processAppealDecision(
    @Param('id') id: string,
    @Body()
    decision: {
      approved: boolean;
      approvedAmount?: number;
      payerResponse: string;
      payerReferenceNumber?: string;
    },
  ) {
    return this.denialService.processAppealDecision(id, decision);
  }
}
