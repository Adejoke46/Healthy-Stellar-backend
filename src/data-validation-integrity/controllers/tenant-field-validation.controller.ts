import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { TenantFieldValidationService } from '../services/tenant-field-validation.service';
import {
  CreateTenantFieldValidationRuleDto,
  UpdateTenantFieldValidationRuleDto,
} from '../dto/tenant-field-validation-rule.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Tenant Field Validation Rules')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/tenants/:tenantId/field-validation-rules')
export class TenantFieldValidationController {
  constructor(private readonly service: TenantFieldValidationService) {}

  @Get()
  @ApiOperation({ summary: 'List custom field validation rules for a tenant' })
  list(@Param('tenantId') tenantId: string) {
    return this.service.listRules(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom field validation rule for a tenant' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateTenantFieldValidationRuleDto) {
    return this.service.createRule(tenantId, dto);
  }

  @Patch(':ruleId')
  @ApiOperation({ summary: 'Update a custom field validation rule for a tenant' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateTenantFieldValidationRuleDto,
  ) {
    return this.service.updateRule(tenantId, ruleId, dto);
  }
}
