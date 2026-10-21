import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { DrugRecallService } from '../services/drug-recall.service';
import { CreateDrugRecallDto } from './create-drug-recall.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Drug Recalls')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('pharmacy/recalls')
export class DrugRecallController {
  constructor(private readonly recallService: DrugRecallService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new drug recall' })
  @ApiResponse({ status: 201, description: 'Recall created; affected patients notified async.' })
  async create(@Body() createDto: CreateDrugRecallDto) {
    return this.recallService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all drug recalls (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async findAll(@Query() pagination: PaginationDto) {
    return this.recallService.findAll(pagination);
  }

  @Get('active')
  @ApiOperation({ summary: 'List active (ongoing) drug recalls (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async getActiveRecalls(@Query() pagination: PaginationDto) {
    return this.recallService.getActiveRecalls(pagination);
  }

  @Get('drug/:drugId')
  @ApiOperation({ summary: 'List recalls for a specific drug (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async getRecallsByDrug(
    @Param('drugId', ParseUUIDPipe) drugId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.recallService.getRecallsByDrug(drugId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single drug recall by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.recallService.findOne(id);
  }

  @Get(':id/impact')
  @ApiOperation({
    summary: 'Recall impact report — affected patients and notification delivery status',
  })
  @ApiResponse({ status: 200, description: 'Paginated RecallImpactReport rows.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async getImpactReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.recallService.getImpactReport(id, pagination);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a drug recall' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: any) {
    return this.recallService.update(id, updateDto);
  }

  @Post(':id/initiate')
  @ApiOperation({ summary: 'Initiate recall — marks inventory and notifies patients' })
  async initiateRecall(@Param('id', ParseUUIDPipe) id: string) {
    return this.recallService.initiateRecall(id);
  }

  @Post(':id/notify')
  async notifyAffected(@Param('id') id: string) {
    const recall = await this.recallService.findOne(id);
    const impact = await this.recallService.computeRecallImpact(id);
    await this.recallService.notifyAffectedUsers(recall, impact);
    return impact;
  }

  @Get(':id/impact')
  async getRecallImpact(@Param('id') id: string) {
    return await this.recallService.getRecallImpact(id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark a recall as completed' })
  async completeRecall(@Param('id', ParseUUIDPipe) id: string) {
    return this.recallService.completeRecall(id);
  }

  @Post(':id/affected-inventory')
  @ApiOperation({ summary: 'Attach affected inventory data to a recall' })
  async addAffectedInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('inventoryData') inventoryData: any[],
  ) {
    return this.recallService.addAffectedInventory(id, inventoryData);
  }

  @Post(':id/action')
  @ApiOperation({ summary: 'Record an action taken on a recall' })
  async addActionTaken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('action') action: string,
    @Body('performedBy') performedBy: string,
  ) {
    return this.recallService.addActionTaken(id, action, performedBy);
  }
}
