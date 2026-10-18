import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { MedicalCodeService } from '../services/medical-code.service';
import { AuditService } from '../../common/audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import {
  CreateMedicalCodeDto,
  UpdateMedicalCodeDto,
  SearchMedicalCodeDto,
} from '../dto/medical-code.dto';
import { CodeType } from '../../common/enums';

@ApiTags('medical-codes')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('medical-codes')
@UseGuards(JwtAuthGuard)
export class MedicalCodeController {
  constructor(
    private readonly medicalCodeService: MedicalCodeService,
    private readonly auditService: AuditService,
  ) { }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({ summary: 'Create a new medical code' })
  @ApiResponse({ status: 201, description: 'Medical code created successfully' })
  async create(@Body() createDto: CreateMedicalCodeDto, @Req() request: any) {
    const medicalCode = await this.medicalCodeService.create(createDto);
    await this.logChange(request, 'MEDICAL_CODE_CREATED', medicalCode.id);
    return medicalCode;
  }

  @Post('bulk')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({ summary: 'Bulk create medical codes' })
  @ApiResponse({ status: 201, description: 'Medical codes created successfully' })
  async bulkCreate(@Body() codes: CreateMedicalCodeDto[], @Req() request: any) {
    const medicalCodes = await this.medicalCodeService.bulkCreate(codes);
    for (const medicalCode of medicalCodes) {
      await this.logChange(request, 'MEDICAL_CODE_BULK_CREATED', medicalCode.id);
    }
    return medicalCodes;
  }

  @Get()
  @ApiOperation({ summary: 'Search medical codes' })
  @ApiResponse({ status: 200, description: 'Medical codes retrieved successfully' })
  async search(@Query() searchDto: SearchMedicalCodeDto) {
    return this.medicalCodeService.search(searchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get medical code by ID' })
  @ApiParam({ name: 'id', description: 'Medical code ID' })
  @ApiResponse({ status: 200, description: 'Medical code retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Medical code not found' })
  async findById(@Param('id') id: string) {
    return this.medicalCodeService.findById(id);
  }

  @Get('lookup/:codeType/:code')
  @ApiOperation({ summary: 'Lookup medical code by code and type' })
  @ApiParam({ name: 'codeType', description: 'Code type (CPT, ICD10-CM, etc.)' })
  @ApiParam({ name: 'code', description: 'Medical code value' })
  @ApiResponse({ status: 200, description: 'Medical code retrieved successfully' })
  async findByCode(@Param('codeType') codeType: CodeType, @Param('code') code: string) {
    return this.medicalCodeService.findByCode(code, codeType);
  }

  @Get('category/:codeType/:category')
  @ApiOperation({ summary: 'Get codes by category' })
  @ApiParam({ name: 'codeType', description: 'Code type' })
  @ApiParam({ name: 'category', description: 'Category name' })
  async getByCategory(@Param('codeType') codeType: CodeType, @Param('category') category: string) {
    if (codeType === CodeType.CPT) {
      return this.medicalCodeService.getCPTCodesByCategory(category);
    }
    return this.medicalCodeService.getICD10CodesByCategory(category);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({ summary: 'Update medical code' })
  @ApiParam({ name: 'id', description: 'Medical code ID' })
  @ApiResponse({ status: 200, description: 'Medical code updated successfully' })
  @ApiResponse({ status: 404, description: 'Medical code not found' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateMedicalCodeDto, @Req() request: any) {
    const medicalCode = await this.medicalCodeService.update(id, updateDto);
    await this.logChange(request, 'MEDICAL_CODE_UPDATED', medicalCode.id);
    return medicalCode;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete medical code' })
  @ApiParam({ name: 'id', description: 'Medical code ID' })
  @ApiResponse({ status: 204, description: 'Medical code deleted successfully' })
  @ApiResponse({ status: 404, description: 'Medical code not found' })
  async delete(@Param('id') id: string, @Req() request: any) {
    await this.medicalCodeService.delete(id);
    await this.logChange(request, 'MEDICAL_CODE_DELETED', id);
  }

  @Put(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({ summary: 'Deactivate medical code' })
  @ApiParam({ name: 'id', description: 'Medical code ID' })
  @ApiResponse({ status: 200, description: 'Medical code deactivated successfully' })
  async deactivate(@Param('id') id: string, @Req() request: any) {
    const medicalCode = await this.medicalCodeService.deactivate(id);
    await this.logChange(request, 'MEDICAL_CODE_DEACTIVATED', medicalCode.id);
    return medicalCode;
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate a list of medical codes' })
  @ApiResponse({ status: 200, description: 'Validation result returned' })
  async validateCodes(@Body() codes: Array<{ code: string; codeType: CodeType }>) {
    return this.medicalCodeService.validateCodes(codes);
  }

  private async logChange(request: any, action: string, resourceId: string): Promise<void> {
    await this.auditService.log({
      actorId: request.user.userId,
      action,
      resourceId,
      resourceType: 'MEDICAL_CODE',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
