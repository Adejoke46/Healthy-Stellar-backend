import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { RoleTemplateService, InstantiateRoleDto } from '../services/role-template.service';
import { RoleTemplateCategory } from '../entities/role-template.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Role Templates')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('role-templates')
export class RoleTemplateController {
  constructor(private readonly templateService: RoleTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List available role templates' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: RoleTemplateCategory,
    description: 'Filter by category',
  })
  @ApiResponse({ status: 200, description: 'List of available templates' })
  async listTemplates(
    @Query('category') category?: RoleTemplateCategory,
  ) {
    return this.templateService.listTemplates(category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get template details by ID' })
  @ApiResponse({ status: 200, description: 'Template details' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templateService.getTemplateById(id);
  }

  @Post('instantiate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Instantiate a tenant role from a template with optional overrides' })
  @ApiResponse({ status: 201, description: 'Role instantiated from template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async instantiateRole(@Body() dto: InstantiateRoleDto) {
    return this.templateService.instantiateRole(dto);
  }

  @Get('versions/:name')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all versions of a template by name' })
  @ApiResponse({ status: 200, description: 'Version history' })
  async getTemplateVersions(@Param('name') name: string) {
    return this.templateService.getTemplateVersions(name);
  }

  @Post('seed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed predefined role templates into database' })
  @ApiResponse({ status: 200, description: 'Templates seeded' })
  async seedTemplates() {
    await this.templateService.seedTemplates();
    return { message: 'Templates seeded successfully' };
  }
}
