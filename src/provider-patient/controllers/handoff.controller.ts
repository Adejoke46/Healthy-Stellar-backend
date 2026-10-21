import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { HandoffService } from '../services/handoff.service';
import { CreateHandoffDto, HandoffQueryDto } from '../dto/handoff.dto';

@ApiTags('Provider-Patient Relationships')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('provider-patient/handoffs')
export class HandoffController {
  constructor(private readonly service: HandoffService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiOperation({ summary: 'Create a care-team handoff and notify the receiving provider' })
  @ApiResponse({ status: 201, description: 'Handoff created' })
  create(@Body() dto: CreateHandoffDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiOperation({ summary: 'List handoffs with optional filters' })
  list(@Query() query: HandoffQueryDto) {
    return this.service.list(query);
  }

  @Get('patient/:patientId/timeline')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.PATIENT)
  @ApiOperation({ summary: 'Handoff history for a patient timeline' })
  @ApiParam({ name: 'patientId' })
  getPatientTimeline(@Param('patientId') patientId: string, @Req() req: Request) {
    const user = req.user as any;
    if (user?.role === UserRole.PATIENT && user.userId !== patientId) {
      throw new ForbiddenException('You can only view your own handoff timeline');
    }
    return this.service.getPatientTimeline(patientId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiOperation({ summary: 'Get a single handoff' })
  findOne(@Param('id') id: string) {
    return this.service.findOneOrFail(id);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiOperation({ summary: 'Receiving provider acknowledges the handoff' })
  @ApiResponse({ status: 200, description: 'Handoff acknowledged' })
  acknowledge(@Param('id') id: string, @Req() req: Request) {
    const providerId = (req.user as any)?.id ?? 'unknown';
    return this.service.acknowledge(id, providerId);
  }
}
