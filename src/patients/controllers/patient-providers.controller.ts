import { Controller, Get, Param, Query, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { PatientProvidersService } from '../services/patient-providers.service';
import { PatientProvidersQueryDto } from '../dto/patient-providers-query.dto';

@ApiTags('patients')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientProvidersController {
  constructor(private readonly patientProvidersService: PatientProvidersService) {}

  @Get(':patientId/providers')
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  @ApiOperation({ summary: "List all providers who have interacted with a patient's records" })
  async getProviders(
    @Param('patientId') patientId: string,
    @Query() query: PatientProvidersQueryDto,
    @Req() req: any,
  ) {
    if (req.user.role === UserRole.PATIENT && req.user.userId !== patientId) {
      throw new ForbiddenException('Patients can only view their own providers');
    }
    return this.patientProvidersService.getProvidersForPatient(patientId, query);
  }
}
