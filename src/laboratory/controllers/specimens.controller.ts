import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { SpecimensService } from '../services/specimens.service';
import { CreateSpecimenDto } from '../dto/create-specimen.dto';
import { SpecimenStatus } from '../entities/specimen.entity';

@ApiTags('Laboratory - Specimens')
@Controller('laboratory/specimens')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class SpecimensController {
  constructor(private readonly specimensService: SpecimensService) {}

  @Post()
  @ApiOperation({ summary: 'Record specimen collection' })
  @ApiResponse({ status: 201, description: 'Specimen created successfully' })
  @ApiResponse({ status: 409, description: 'Specimen ID already exists' })
  create(@Body() createDto: CreateSpecimenDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.specimensService.create(createDto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specimen by ID' })
  @ApiResponse({ status: 200, description: 'Specimen retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Specimen not found' })
  findOne(@Param('id') id: string) {
    return this.specimensService.findOne(id);
  }

  @Get('specimen-id/:specimenId')
  @ApiOperation({ summary: 'Get specimen by specimen ID (barcode)' })
  @ApiResponse({ status: 200, description: 'Specimen retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Specimen not found' })
  findBySpecimenId(@Param('specimenId') specimenId: string) {
    return this.specimensService.findBySpecimenId(specimenId);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get specimens for a lab order' })
  @ApiResponse({ status: 200, description: 'Specimens retrieved successfully' })
  findByOrder(@Param('orderId') orderId: string) {
    return this.specimensService.findByOrder(orderId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update specimen status' })
  @ApiResponse({ status: 200, description: 'Specimen status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: SpecimenStatus,
    @Body('location') location: string,
    @Body('notes') notes: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    const userName = req.user?.name;
    return this.specimensService.updateStatus(id, status, userId, userName, location, notes);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject specimen' })
  @ApiResponse({ status: 200, description: 'Specimen rejected successfully' })
  reject(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    const userName = req.user?.name;
    return this.specimensService.reject(id, reason, userId, userName);
  }

  @Patch(':id/storage')
  @ApiOperation({ summary: 'Update specimen storage location' })
  @ApiResponse({ status: 200, description: 'Storage location updated successfully' })
  updateStorage(
    @Param('id') id: string,
    @Body('storageLocation') storageLocation: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    const userName = req.user?.name;
    return this.specimensService.updateStorage(id, storageLocation, userId, userName);
  }
}
