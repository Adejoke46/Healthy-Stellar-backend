import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { TenantService } from '../services/tenant.service';
import { CreateTenantDto, UpdateTenantDto } from '../dto/tenant.dto';

@ApiTags('Tenant Management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @ApiOperation({
    summary: 'Create new tenant',
    description:
      'Provisions a new tenant with dedicated PostgreSQL schema, runs migrations, and seeds base data',
  })
  @ApiResponse({ status: 201, description: 'Tenant created and schema provisioned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN role required' })
  @ApiResponse({ status: 409, description: 'Tenant with this slug already exists' })
  async create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantService.create(createTenantDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants' })
  @ApiResponse({ status: 200, description: 'Tenants retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN role required' })
  async findAll() {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant details' })
  @ApiResponse({ status: 200, description: 'Tenant retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN role required' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN role required' })
  async update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete tenant',
    description:
      'Marks the tenant as deleted. The PostgreSQL schema is preserved and dropped only by an operator job after final confirmation.',
  })
  @ApiResponse({ status: 200, description: 'Tenant marked for deletion' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN role required' })
  async delete(@Param('id') id: string) {
    await this.tenantService.softDelete(id);
    return { message: 'Tenant scheduled for deletion' };
  }
}
