import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import {
  CreateClinicalNoteDto,
  SearchClinicalNotesDto,
  UpdateClinicalNoteDto,
} from '../dto/clinical-note.dto';
import { ClinicalNotesService } from '../services/clinical-notes.service';

@ApiTags('Clinical Notes')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PHYSICIAN, UserRole.NURSE, UserRole.SURGEON, UserRole.ADMIN)
@Controller('clinical-notes')
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create clinical note' })
  @ApiResponse({ status: 201, description: 'Clinical note created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — clinical role required' })
  async create(@Body() createDto: CreateClinicalNoteDto) {
    return await this.clinicalNotesService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Search clinical notes' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — clinical role required' })
  async findAll(@Query() filters: SearchClinicalNotesDto) {
    return await this.clinicalNotesService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinical note by ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — clinical role required' })
  async findById(@Param('id') id: string) {
    return await this.clinicalNotesService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update clinical note' })
  @ApiResponse({ status: 409, description: 'Conflict — signed notes are immutable' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — clinical role required' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateClinicalNoteDto) {
    return await this.clinicalNotesService.update(id, updateDto);
  }

  @Post(':id/sign')
  @Roles(UserRole.PHYSICIAN, UserRole.SURGEON)
  @ApiOperation({ summary: 'Sign clinical note — signer derived from authenticated user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — PHYSICIAN or SURGEON role required' })
  async sign(@Param('id') id: string, @Request() req: any) {
    return await this.clinicalNotesService.sign(id, req.user.userId);
  }

  @Get(':id/completeness')
  @ApiOperation({ summary: 'Check clinical note completeness' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — clinical role required' })
  async getCompleteness(@Param('id') id: string) {
    return await this.clinicalNotesService.getCompleteness(id);
  }
}
