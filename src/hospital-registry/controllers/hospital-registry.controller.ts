import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { HospitalRegistryService } from '../services/hospital-registry.service';
import { CreateHospitalRegistryDto, UpdateHospitalRegistryDto } from '../dto/hospital-registry.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('hospital-registry')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospital-registry')
export class HospitalRegistryController {
  constructor(private readonly service: HospitalRegistryService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateHospitalRegistryDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId ?? req.user?.id ?? 'system');
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get('license/:licenseNumber')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  findByLicense(@Param('licenseNumber') licenseNumber: string) {
    return this.service.findByLicense(licenseNumber);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateHospitalRegistryDto, @Req() req: any) {
    return this.service.update(id, dto, req.user?.userId ?? req.user?.id ?? 'system');
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user?.userId ?? req.user?.id ?? 'system');
  }
}
