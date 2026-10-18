import {
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
  Body,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ProviderDirectoryQueryDto } from '../dto/provider-directory-query.dto';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ProviderDirectoryService } from '../services/provider-directory.service';
import { ProviderAvailabilityService } from '../services/provider-availability.service';
import { UpdateProviderAvailabilityDto } from '../dto/update-provider-availability.dto';
import { UserRole } from '../entities/user.entity';

@ApiTags('Providers')
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providerDirectoryService: ProviderDirectoryService,
    private readonly availabilityService: ProviderAvailabilityService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ ip: { limit: 30, ttl: 60000 }, user: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Search provider directory',
    description:
      'Returns paginated providers. `stellarAddress` is returned only for authenticated requests.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'specialty', required: false, type: String })
  @ApiQuery({ name: 'specialization', required: false, type: String })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'isAcceptingPatients', required: false, type: Boolean })
  @ApiQuery({ name: 'role', required: false, enum: ['doctor', 'lab', 'insurer'] })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Providers returned successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async findProviders(@Query() query: ProviderDirectoryQueryDto, @Req() req: Request) {
    const isAuthenticated = Boolean(req.user);
    return this.providerDirectoryService.searchProviders(query, isAuthenticated);
  }

  @Get('available')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ ip: { limit: 30, ttl: 60000 }, user: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get available providers',
    description:
      'Returns list of providers accepting patients, optionally filtered by specialization',
  })
  @ApiQuery({ name: 'specialization', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Available providers returned successfully' })
  async getAvailableProviders(@Query('specialization') specialization?: string) {
    return this.availabilityService.getAvailableProviders(specialization);
  }

  @Get(':address/availability')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ ip: { limit: 30, ttl: 60000 }, user: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get provider availability and capacity',
    description: 'Returns availability status and patient capacity for a specific provider',
  })
  @ApiResponse({ status: 200, description: 'Provider availability returned successfully' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async getProviderAvailability(@Param('address') providerId: string) {
    return this.availabilityService.getAvailability(providerId);
  }

  @Patch(':address/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Throttle({ ip: { limit: 10, ttl: 60000 }, user: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Update provider availability and capacity',
    description: 'Allows providers to update their availability status and patient capacity',
  })
  @ApiResponse({ status: 200, description: 'Provider availability updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - can only update own availability' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async updateProviderAvailability(
    @Param('address') providerId: string,
    @Body() updateDto: UpdateProviderAvailabilityDto,
    @Req() req: Request,
  ) {
    const user = req.user as any;

    // Only providers can update their own availability
    if (user.id !== providerId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Can only update your own availability');
    }

    return this.availabilityService.updateAvailability(providerId, updateDto);
  }
}
