import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { BreakGlassService } from '../services/break-glass.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

class GrantBreakGlassDto {
  patientId: string;
  justification: string;
  clinicalContext?: string;
}

class ReviewBreakGlassDto {
  reviewNotes: string;
  outcome: 'approved' | 'denied';
}

@ApiTags('Break-Glass Access')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('access/break-glass')
export class BreakGlassController {
  constructor(private readonly breakGlassService: BreakGlassService) {}

  @Post('grant')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PHYSICIAN, UserRole.NURSE, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant break-glass emergency access with justification' })
  @ApiResponse({ status: 201, description: 'Break-glass access granted' })
  @ApiResponse({ status: 400, description: 'Invalid justification or duplicate active session' })
  async grantBreakGlass(
    @Body() dto: GrantBreakGlassDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.breakGlassService.grantBreakGlassAccess(
      user.userId,
      dto.patientId,
      dto.justification,
      dto.clinicalContext,
    );
  }

  @Get('unreviewed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List unreviewed break-glass accesses' })
  @ApiResponse({ status: 200, description: 'List of unreviewed accesses' })
  async getUnreviewed() {
    return this.breakGlassService.getUnreviewedAccesses();
  }

  @Get('sla-breaches')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List break-glass accesses past the SLA window' })
  @ApiResponse({ status: 200, description: 'SLA breach list' })
  async getSlaBreaches() {
    return this.breakGlassService.getBreachOfSlaAccesses();
  }

  @Get('patient/:patientId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all break-glass accesses for a patient' })
  async getForPatient(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.breakGlassService.getAllForPatient(patientId);
  }

  @Get('grantee/:granteeId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all break-glass accesses for a grantee' })
  async getForGrantee(@Param('granteeId', ParseUUIDPipe) granteeId: string) {
    return this.breakGlassService.getAllForGrantee(granteeId);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review a break-glass access (approve/deny)' })
  @ApiResponse({ status: 200, description: 'Access reviewed' })
  @ApiResponse({ status: 404, description: 'Access not found' })
  async reviewAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewBreakGlassDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.breakGlassService.reviewBreakGlassAccess(
      id,
      user.userId,
      dto.reviewNotes,
      dto.outcome,
    );
  }

  @Patch(':id/revoke')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force-revoke a break-glass access' })
  async revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.breakGlassService.revokeAccess(id, user.userId, reason);
  }

  @Post('sweep')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger the break-glass sweep (expiry + SLA check)' })
  async triggerSweep() {
    return this.breakGlassService.runSweep();
  }
}
