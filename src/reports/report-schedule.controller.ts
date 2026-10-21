import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Request } from 'express';
import { ReportScheduleService } from './report-schedule.service';
import { CreateReportScheduleDto, UpdateReportScheduleDto } from './dto/report-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { JwtPayload } from '../auth/services/auth-token.service';

/** Resolves the caller's tenant from the verified JWT; schedules are always tenant-scoped. */
function getTenantId(req: Request): string {
  const user = (req as Request & { user?: JwtPayload & { tenantId?: string } }).user;
  const tenantId = user?.organizationId ?? user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenException('Tenant context is required');
  }
  return tenantId;
}

/**
 * Public one-click unsubscribe endpoint embedded in every delivery email.
 *
 * Kept in its own unguarded controller so the admin CRUD controller can apply
 * authentication at class level. It is registered before ReportScheduleController
 * in ReportsModule so `GET unsubscribe` is matched before `GET :id`.
 * Authorisation is by the schedule's unsubscribe token only.
 */
@ApiTags('Admin - Report Schedules')
@Controller('admin/report-schedules')
export class ReportScheduleUnsubscribeController {
  constructor(private readonly scheduleService: ReportScheduleService) {}

  @Get('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe a recipient from a report schedule' })
  unsubscribe(@Query('token') token: string, @Query('email') email: string) {
    if (!token || !email) {
      throw new BadRequestException('token and email are required');
    }
    return this.scheduleService.unsubscribe(token, email);
  }
}

@ApiTags('Admin - Report Schedules')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('admin/report-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ReportScheduleController {
  constructor(private readonly scheduleService: ReportScheduleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new report delivery schedule' })
  create(@Body() dto: CreateReportScheduleDto, @Req() req: Request) {
    return this.scheduleService.create(dto, getTenantId(req));
  }

  @Get()
  @ApiOperation({ summary: 'List all report schedules' })
  findAll(@Req() req: Request) {
    return this.scheduleService.findAll(getTenantId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single report schedule' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.scheduleService.findOne(id, getTenantId(req));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a report schedule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportScheduleDto,
    @Req() req: Request,
  ) {
    return this.scheduleService.update(id, dto, getTenantId(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a report schedule' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.scheduleService.remove(id, getTenantId(req));
  }
}
