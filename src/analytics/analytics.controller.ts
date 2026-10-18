import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Header,
  Res,
  BadRequestException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { AnalyticsService } from './analytics.service';
import { OverviewResponseDto } from './dto/overview-response.dto';
import { ActivityQueryDto, ActivityResponseDto } from './dto';
import { TopProvidersResponseDto } from './dto/top-providers-response.dto';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { TenantGuard } from '../tenant/guards/tenant.guard';
import { TenantInterceptor } from '../tenant/interceptors/tenant.interceptor';

@ApiTags('Analytics')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AdminGuard, TenantGuard)
@UseInterceptors(TenantInterceptor)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats returned', type: AdminStatsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getStats(): Promise<AdminStatsResponseDto> {
    return this.analyticsService.getStats();
  }

  @Get('overview')
  @Header('Cache-Control', 'max-age=60, stale-while-revalidate=30')
  @ApiOperation({ summary: 'Get system overview metrics' })
  @ApiResponse({
    status: 200,
    description: 'Returns aggregate system metrics',
    type: OverviewResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getOverview(): Promise<OverviewResponseDto> {
    return this.analyticsService.getOverview();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get daily activity time series' })
  @ApiQuery({ name: 'from', type: String, description: 'Start date (ISO 8601 format)' })
  @ApiQuery({ name: 'to', type: String, description: 'End date (ISO 8601 format)' })
  @ApiResponse({
    status: 200,
    description: 'Returns daily record uploads and access events',
    type: ActivityResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid date parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getActivity(@Query() query: ActivityQueryDto): Promise<ActivityResponseDto> {
    // Convert string dates to Date objects
    const from = new Date(query.from);
    const to = new Date(query.to);

    // Validate that dates are valid
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date parameters');
    }

    // Validate that from is before or equal to to
    if (from > to) {
      throw new BadRequestException('from date must be before or equal to to date');
    }

    return this.analyticsService.getActivity(from, to);
  }

  @Get('top-providers')
  @ApiOperation({ summary: 'Get top providers by active grants' })
  @ApiResponse({
    status: 200,
    description: 'Returns providers ranked by active grant count',
    type: TopProvidersResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getTopProviders(): Promise<TopProvidersResponseDto> {
    return this.analyticsService.getTopProviders();
  }
}

