import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { DisputeService } from '../services/dispute.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';

@ApiTags('billing/disputes')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('billing/disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new billing dispute' })
  @ApiResponse({ status: 201, description: 'Dispute created successfully' })
  async create(@Body() dto: CreateDisputeDto, @Request() req: any) {
    const createdBy: string = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.disputeService.create(dto, createdBy);
  }

  @Get()
  @ApiOperation({ summary: 'List all billing disputes' })
  @ApiResponse({ status: 200, description: 'Disputes retrieved successfully' })
  async findAll() {
    return this.disputeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single dispute by ID' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async findOne(@Param('id') id: string) {
    return this.disputeService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update dispute status (state machine enforced)' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateDisputeDto) {
    return this.disputeService.updateStatus(id, dto);
  }
}
