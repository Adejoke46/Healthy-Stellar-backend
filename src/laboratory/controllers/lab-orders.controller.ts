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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { LabOrdersService } from '../services/lab-orders.service';
import { CreateLabOrderDto } from '../dto/create-lab-order.dto';
import { UpdateLabOrderDto } from '../dto/update-lab-order.dto';
import { SearchLabOrdersDto } from '../dto/search-lab-orders.dto';

@ApiTags('Laboratory - Orders')
@Controller('laboratory/orders')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lab order' })
  @ApiResponse({ status: 201, description: 'Lab order created successfully' })
  create(@Body() createDto: CreateLabOrderDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labOrdersService.create(createDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Search lab orders' })
  @ApiResponse({ status: 200, description: 'Lab orders retrieved successfully' })
  findAll(@Query() searchDto: SearchLabOrdersDto) {
    return this.labOrdersService.findAll(searchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lab order by ID' })
  @ApiResponse({ status: 200, description: 'Lab order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Lab order not found' })
  findOne(@Param('id') id: string) {
    return this.labOrdersService.findOne(id);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get lab orders for a patient' })
  @ApiResponse({ status: 200, description: 'Lab orders retrieved successfully' })
  findByPatient(@Param('patientId') patientId: string) {
    return this.labOrdersService.findByPatient(patientId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lab order' })
  @ApiResponse({ status: 200, description: 'Lab order updated successfully' })
  @ApiResponse({ status: 404, description: 'Lab order not found' })
  update(@Param('id') id: string, @Body() updateDto: UpdateLabOrderDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labOrdersService.update(id, updateDto, userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel lab order' })
  @ApiResponse({ status: 200, description: 'Lab order cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed order' })
  cancel(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.labOrdersService.cancel(id, reason, userId);
  }
}
