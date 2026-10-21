import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { PatientsService } from '../../patients/patients.service';
import { AdminMergePatientsDto } from '../../patients/dto/admin-merge-patients.dto';
import { Patient } from '../../patients/entities/patient.entity';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';

@ApiTags('Admin - Patients')
@Controller('admin/patients')
@UseGuards(IpAllowlistGuard, JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class AdminPatientsController {
  constructor(private patientService: PatientsService) {}

  @Post('merge')
  @ApiOperation({ summary: 'Merge duplicate patient accounts' })
  @ApiResponse({
    status: 200,
    description: 'Patients merged successfully. Records, access grants, and audit logs transferred.',
  })
  @ApiResponse({ status: 400, description: 'Invalid input or self-merge attempt' })
  @ApiResponse({ status: 404, description: 'One or both patient accounts not found' })
  async mergePatients(
    @Body() mergeDto: AdminMergePatientsDto,
    @Req() req: Request,
  ): Promise<Patient> {
    const user = req.user as any; // From JWT guard
    return this.patientService.adminMergePatients(mergeDto, user.id);
  }
}
