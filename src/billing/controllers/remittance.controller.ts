import {
  Controller,
  Get,
  Post,
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
import { RemittanceService } from '../services/remittance.service';
import { IngestRemittanceDto } from '../dto/ingest-remittance.dto';

@ApiTags('billing/remittances')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('billing/remittances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
export class RemittanceController {
  constructor(private readonly remittanceService: RemittanceService) {}

  @Post()
  @ApiOperation({ summary: 'Ingest a remittance (ERA/835) payload and auto-match to claims' })
  @ApiResponse({ status: 201, description: 'Remittance ingested successfully' })
  async ingestRemittance(@Body() dto: IngestRemittanceDto, @Request() req: any) {
    const operatorId: string = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.remittanceService.ingestRemittance(dto, operatorId);
  }

  @Get()
  @ApiOperation({ summary: 'List all remittances' })
  @ApiResponse({ status: 200, description: 'Remittances retrieved successfully' })
  async findAll() {
    return this.remittanceService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single remittance by ID' })
  @ApiParam({ name: 'id', description: 'Remittance ID' })
  @ApiResponse({ status: 200, description: 'Remittance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Remittance not found' })
  async findOne(@Param('id') id: string) {
    return this.remittanceService.findOne(id);
  }
}
