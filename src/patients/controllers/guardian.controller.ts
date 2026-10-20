import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GuardianService } from '../services/guardian.service';
import { CreateGuardianLinkDto } from '../dto/create-guardian-link.dto';
import { RevokeGuardianLinkDto } from '../dto/revoke-guardian-link.dto';
import { AdminGuard } from '../guards/admin-guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('guardians')
@Controller('guardians')
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  /**
   * POST /guardians
   * Admin / registration only — create a guardian link.
   */
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Create a guardian link (admin/registration only)' })
  create(@Body() dto: CreateGuardianLinkDto, @Request() req: any) {
    const actorId: string = req.user?.id ?? 'system';
    return this.guardianService.createLink(dto, actorId);
  }

  /**
   * DELETE /guardians/:id
   * Admin / registration only — revoke a guardian link.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Revoke a guardian link (admin/registration only)' })
  @ApiParam({ name: 'id', description: 'Guardian link UUID' })
  revoke(
    @Param('id') linkId: string,
    @Body() dto: RevokeGuardianLinkDto,
    @Request() req: any,
  ) {
    const actorId: string = req.user?.id ?? 'system';
    return this.guardianService.revokeLink(linkId, actorId, dto);
  }

  /**
   * GET /guardians/dependent/:patientId
   * Returns all active guardian links for a dependent patient.
   */
  @Get('dependent/:patientId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get guardian links for a dependent patient' })
  @ApiParam({ name: 'patientId', description: 'Dependent patient UUID' })
  getForDependent(@Param('patientId') patientId: string) {
    return this.guardianService.getLinksForDependent(patientId);
  }

  /**
   * GET /guardians/guardian/:userId
   * Returns all active dependents linked to a guardian user.
   */
  @Get('guardian/:userId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get dependents linked to a guardian user' })
  @ApiParam({ name: 'userId', description: 'Guardian user UUID' })
  getForGuardian(@Param('userId') userId: string) {
    return this.guardianService.getLinksForGuardian(userId);
  }
}
