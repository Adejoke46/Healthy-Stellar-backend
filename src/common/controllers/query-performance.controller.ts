import { Controller, Get, Post, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../constants/swagger.constants';
import { QueryPerformanceMonitor } from '../services/query-performance-monitor.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Query Performance')
@Controller('admin/query-performance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class QueryPerformanceController {
  constructor(private readonly monitor: QueryPerformanceMonitor) {}

  @Get('slow-queries')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get slow queries from pg_stat_statements' })
  @ApiResponse({ status: 200, description: 'List of slow queries' })
  async getSlowQueries(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.monitor.getSlowQueries(limit);
  }

  @Post('reset-stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reset query statistics' })
  @ApiResponse({ status: 200, description: 'Statistics reset successfully' })
  async resetStats() {
    await this.monitor.resetStats();
    return { message: 'Query statistics reset successfully' };
  }
}
