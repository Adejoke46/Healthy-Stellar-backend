import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenant/guards/tenant.guard';
import { MedicalStaffService } from './medical-staff.service';
import { STAFF_READ_ROLES } from './medical-staff.controller';

@ApiTags('wards')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(...STAFF_READ_ROLES)
@Controller('wards')
export class WardShiftsController {
  constructor(private readonly staffService: MedicalStaffService) {}

  /** GET /wards/:id/shifts?week=YYYY-MM-DD */
  @Get(':id/shifts')
  @ApiOperation({ summary: 'Get all shifts for a ward in a given week' })
  @ApiParam({ name: 'id', description: 'Ward ID' })
  @ApiQuery({ name: 'week', required: false, description: 'ISO date of any day in the target week (defaults to current week)' })
  getWardShifts(@Param('id') wardId: string, @Query('week') week?: string) {
    return this.staffService.getWardShifts(wardId, week);
  }
}
