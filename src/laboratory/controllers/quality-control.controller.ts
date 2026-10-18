import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { QualityControlService } from '../services/quality-control.service';
import { CreateQualityControlDto } from '../dto/create-quality-control.dto';
import { QCType, QCResult } from '../entities/quality-control-log.entity';

@ApiTags('Laboratory - Quality Control')
@Controller('laboratory/qc')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class QualityControlController {
  constructor(private readonly qcService: QualityControlService) {}

  @Post()
  @ApiOperation({ summary: 'Log QC activity' })
  @ApiResponse({ status: 201, description: 'QC log created successfully' })
  create(@Body() createDto: CreateQualityControlDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.qcService.create(createDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get QC logs' })
  @ApiResponse({ status: 200, description: 'QC logs retrieved successfully' })
  findAll(
    @Query('equipmentId') equipmentId?: string,
    @Query('labTestId') labTestId?: string,
    @Query('qcType') qcType?: QCType,
    @Query('qcResult') qcResult?: QCResult,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.qcService.findAll({
      equipmentId,
      labTestId,
      qcType,
      qcResult,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get QC log by ID' })
  @ApiResponse({ status: 200, description: 'QC log retrieved successfully' })
  @ApiResponse({ status: 404, description: 'QC log not found' })
  findOne(@Param('id') id: string) {
    return this.qcService.findOne(id);
  }

  @Get('equipment/:equipmentId')
  @ApiOperation({ summary: 'Get QC logs for equipment' })
  @ApiResponse({ status: 200, description: 'QC logs retrieved successfully' })
  findByEquipment(@Param('equipmentId') equipmentId: string) {
    return this.qcService.findByEquipment(equipmentId);
  }

  @Get('equipment/:equipmentId/statistics')
  @ApiOperation({ summary: 'Get QC statistics for equipment' })
  @ApiResponse({ status: 200, description: 'QC statistics retrieved successfully' })
  getStatistics(@Param('equipmentId') equipmentId: string, @Query('days') days?: number) {
    return this.qcService.getQCStatistics(equipmentId, days);
  }

  @Get('overdue/list')
  @ApiOperation({ summary: 'Get overdue calibrations' })
  @ApiResponse({ status: 200, description: 'Overdue calibrations retrieved successfully' })
  findOverdue() {
    return this.qcService.findOverdue();
  }

  @Get('failed/list')
  @ApiOperation({ summary: 'Get failed QC tests' })
  @ApiResponse({ status: 200, description: 'Failed QC tests retrieved successfully' })
  findFailed(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.qcService.findFailedQC({ startDate, endDate });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update QC log' })
  @ApiResponse({ status: 200, description: 'QC log updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateQualityControlDto>,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.qcService.update(id, updateDto, userId);
  }
}
