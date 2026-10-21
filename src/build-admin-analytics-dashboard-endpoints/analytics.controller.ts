import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { AnalyticsService } from './analytics.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { AnalyticsCacheInterceptor } from './interceptors/analytics-cache.interceptor';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Admin Analytics')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseInterceptors(AnalyticsCacheInterceptor)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform-wide aggregate metrics' })
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Daily record uploads and access events time-series' })
  @ApiQuery({ name: 'from', required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2024-01-31' })
  async getActivity(@Query() query: ActivityQueryDto) {
    return this.analyticsService.getActivity(query.from, query.to);
  }

  @Get('top-providers')
  @ApiOperation({ summary: 'Providers ranked by active access grants' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async getTopProviders(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.analyticsService.getTopProviders(Math.min(limit, 100));
  }
}
