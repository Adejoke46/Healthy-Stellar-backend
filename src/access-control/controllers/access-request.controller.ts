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
import { AccessRequestService } from '../services/access-request.service';
import { CreateAccessRequestDto } from '../dto/create-access-request.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { JwtPayload } from '../../auth/services/auth-token.service';

@ApiTags('Access Requests')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('access')
export class AccessRequestController {
  constructor(private readonly accessRequestService: AccessRequestService) {}

  /**
   * Provider submits a formal access request to a patient.
   */
  @Post('request')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PHYSICIAN, UserRole.NURSE, UserRole.ADMIN)
  @ApiOperation({ summary: 'Provider submits an access request to a patient' })
  @ApiResponse({ status: 201, description: 'Request submitted; patient notified' })
  @ApiResponse({ status: 409, description: 'Duplicate pending request exists' })
  async submitRequest(
    @Body() dto: CreateAccessRequestDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.accessRequestService.submitRequest(user.userId, dto);
  }

  /**
   * Patient views all pending (non-expired) requests directed at them.
   */
  @Get('requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Patient lists pending access requests' })
  @ApiResponse({ status: 200, description: 'List of pending requests' })
  async getPendingRequests(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.accessRequestService.getPendingRequests(user.userId);
  }

  /**
   * Patient approves a request — triggers on-chain grant_access.
   */
  @Patch('requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Patient approves an access request' })
  @ApiResponse({ status: 200, description: 'Request approved; grant created on-chain' })
  @ApiResponse({ status: 403, description: 'Not the target patient' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request already responded to or expired' })
  async approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.accessRequestService.approveRequest(id, user.userId);
  }

  /**
   * Patient denies a request.
   */
  @Patch('requests/:id/deny')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Patient denies an access request' })
  @ApiResponse({ status: 200, description: 'Request denied' })
  @ApiResponse({ status: 403, description: 'Not the target patient' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request already responded to or expired' })
  async denyRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.accessRequestService.denyRequest(id, user.userId);
  }
}
