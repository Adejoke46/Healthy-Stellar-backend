import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { CreateLabOrderDto, CreateSpecimenDto } from '../dto/laboratory.dto';

@ApiTags('Laboratory Management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
@Controller('laboratory')
export class LaboratoryController {
  @Get('tests')
  @ApiOperation({
    summary: 'Get available lab tests',
    description: 'Retrieve catalog of available laboratory tests',
  })
  @ApiResponse({ status: 200, description: 'Lab tests retrieved' })
  async getTests(@Query('category') category?: string) {
    return [];
  }

  @Get('tests/:id')
  @ApiOperation({
    summary: 'Get test details',
    description: 'Retrieve test information including reference ranges',
  })
  @ApiResponse({ status: 200, description: 'Test details retrieved' })
  async getTest(@Param('id') id: string) {
    return { id, testCode: 'CBC', testName: 'Complete Blood Count' };
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create lab order', description: 'Order laboratory tests for patient' })
  @ApiResponse({ status: 201, description: 'Lab order created' })
  async createOrder(@Body() dto: CreateLabOrderDto) {
    return { id: 'order-uuid', orderNumber: 'LAB-2024-0001', status: 'pending' };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get lab order', description: 'Retrieve lab order details and status' })
  @ApiResponse({ status: 200, description: 'Order retrieved' })
  async getOrder(@Param('id') id: string) {
    return { id, orderNumber: 'LAB-2024-0001', status: 'pending' };
  }

  @Get('orders/patient/:patientId')
  @ApiOperation({
    summary: 'Get patient lab orders',
    description: 'Retrieve all lab orders for a patient',
  })
  @ApiResponse({ status: 200, description: 'Patient orders retrieved' })
  async getPatientOrders(@Param('patientId') patientId: string) {
    return [];
  }

  @Post('specimens')
  @ApiOperation({
    summary: 'Register specimen',
    description: 'Register collected specimen with tracking',
  })
  @ApiResponse({ status: 201, description: 'Specimen registered' })
  async createSpecimen(@Body() dto: CreateSpecimenDto) {
    return { id: 'specimen-uuid', specimenId: 'SPEC-2024-0001', status: 'collected' };
  }

  @Get('specimens/:id')
  @ApiOperation({ summary: 'Track specimen', description: 'Get specimen location and status' })
  @ApiResponse({ status: 200, description: 'Specimen tracking retrieved' })
  async getSpecimen(@Param('id') id: string) {
    return { id, specimenId: 'SPEC-2024-0001', status: 'in_lab', location: 'Lab Station 3' };
  }

  @Put('specimens/:id/status')
  @ApiOperation({
    summary: 'Update specimen status',
    description: 'Update specimen tracking status',
  })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateSpecimenStatus(
    @Param('id') id: string,
    @Body() body: { status: string; location: string },
  ) {
    return { id, status: body.status, location: body.location };
  }

  @Get('workflow/pending')
  @ApiOperation({ summary: 'Get pending tests', description: 'Retrieve tests pending processing' })
  @ApiResponse({ status: 200, description: 'Pending tests retrieved' })
  async getPendingTests() {
    return [];
  }

  @Get('reports/turnaround')
  @ApiOperation({ summary: 'Turnaround time report', description: 'Analyze lab turnaround times' })
  @ApiResponse({ status: 200, description: 'Report generated' })
  async getTurnaroundReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return { averageTAT: 24, onTimeRate: 95.5 };
  }

  @Get('equipment/status')
  @ApiOperation({
    summary: 'Equipment status',
    description: 'Get lab equipment status and availability',
  })
  @ApiResponse({ status: 200, description: 'Equipment status retrieved' })
  async getEquipmentStatus() {
    return [];
  }
}
