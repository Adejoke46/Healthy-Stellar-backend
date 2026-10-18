import { Controller, Get, Post, Body, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import {
  DoctorAvailabilityService,
  CreateDoctorAvailabilityDto,
} from '../services/doctor-availability.service';
import { AvailabilityStatus } from '../entities/doctor-availability.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('Doctor Availability')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('doctor-availability')
export class DoctorAvailabilityController {
  constructor(private readonly availabilityService: DoctorAvailabilityService) {}

  @Post()
  @ApiOperation({ summary: 'Set doctor availability schedule' })
  @ApiResponse({ status: 201, description: 'Availability schedule created' })
  create(@Body() createDto: CreateDoctorAvailabilityDto) {
    return this.availabilityService.create(createDto);
  }

  @Get('doctor/:doctorId')
  @ApiOperation({ summary: 'Get doctor availability schedule' })
  @ApiResponse({ status: 200, description: 'Doctor availability schedule' })
  findByDoctor(@Param('doctorId') doctorId: string) {
    return this.availabilityService.findByDoctor(doctorId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update availability status' })
  @ApiResponse({ status: 200, description: 'Availability status updated' })
  updateStatus(@Param('id') id: string, @Body('status') status: AvailabilityStatus) {
    return this.availabilityService.updateStatus(id, status);
  }
}
