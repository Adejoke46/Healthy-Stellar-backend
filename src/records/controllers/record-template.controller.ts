import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RecordTemplateService } from '../services/record-template.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { CreateRecordFromTemplateDto } from '../dto/create-record-from-template.dto';

@ApiTags('Templates')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller()
export class RecordTemplateController {
  constructor(private readonly templateService: RecordTemplateService) {}

  @Post('templates')
  @ApiOperation({ summary: 'Create a record template (provider only)' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid schema JSON' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() dto: CreateTemplateDto, @Req() req: any) {
    const providerId = this.extractProviderId(req);
    return this.templateService.create(providerId, dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'List public templates and own templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async findAll(@Req() req: any) {
    const providerId = this.extractProviderId(req);
    return this.templateService.findAll(providerId);
  }

  @Post('records/from-template/:templateId')
  @ApiOperation({ summary: 'Create a record pre-filled from a template' })
  @ApiResponse({ status: 201, description: 'Record created from template' })
  @ApiResponse({ status: 403, description: 'Access to template not allowed' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createFromTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: CreateRecordFromTemplateDto,
    @Req() req: any,
  ) {
    const providerId = this.extractProviderId(req);
    return this.templateService.createRecordFromTemplate(templateId, providerId, dto);
  }

  private extractProviderId(req: any): string {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw new UnauthorizedException('Provider ID not found in token');
    return userId;
  }
}
