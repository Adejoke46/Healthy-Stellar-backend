import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { ProviderPatientRelationshipService } from '../services/provider-patient-relationship.service';
import { RelationshipQueryDto } from '../dto/relationship-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('Provider-Patient Relationships')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProviderPatientRelationshipController {
  constructor(private readonly service: ProviderPatientRelationshipService) {}

  @Get('providers/:address/patients')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiOperation({ summary: 'List patients treated by a provider' })
  @ApiParam({ name: 'address', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of patients for the provider' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getPatientsByProvider(
    @Param('address') address: string,
    @Query() query: RelationshipQueryDto,
  ) {
    return this.service.getPatientsByProvider(address, query);
  }

  @Get('patients/:address/providers')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.PATIENT)
  @ApiOperation({ summary: 'List providers who have treated a patient' })
  @ApiParam({ name: 'address', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of providers for the patient' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getProvidersByPatient(
    @Param('address') address: string,
    @Query() query: RelationshipQueryDto,
    @Request() req: any,
  ) {
    const user = req.user;
    // Patients may only view their own provider list
    if (user.role === UserRole.PATIENT && user.userId !== address) {
      throw new ForbiddenException('Patients can only view their own provider relationships');
    }
    return this.service.getProvidersByPatient(address, query);
  }
}
