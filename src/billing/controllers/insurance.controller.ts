import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { InsuranceService } from '../services/insurance.service';
import { VerifyEligibilityDto, CreateInsuranceDto } from '../dto/insurance.dto';

@ApiTags('Insurance Verification')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('insurance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post('verify')
  @ApiOperation({
    summary: 'Verify insurance eligibility',
    description: 'Real-time insurance eligibility verification via EDI 270/271 transaction'
  })
  @ApiResponse({
    status: 200,
    description: 'Eligibility verified successfully',
    schema: {
      example: {
        eligible: true,
        payer: 'Blue Cross Blue Shield',
        planName: 'PPO Gold',
        coverageLevel: 'family',
        copay: 25.00,
        deductible: 1500.00,
        deductibleMet: 750.00,
        outOfPocketMax: 5000.00,
        effectiveDate: '2024-01-01',
        terminationDate: '2024-12-31'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid insurance information' })
  @ApiResponse({ status: 404, description: 'Insurance not found or inactive' })
  async verifyEligibility(@Body() verifyDto: VerifyEligibilityDto) {
    return this.insuranceService.verifyEligibility(verifyDto);
  }

  @Post()
  @ApiOperation({
    summary: 'Add patient insurance',
    description: 'Register new insurance coverage for patient'
  })
  @ApiResponse({ status: 201, description: 'Insurance added successfully' })
  async create(@Body() createDto: CreateInsuranceDto) {
    return this.insuranceService.create(createDto);
  }

  @Get('patient/:patientId')
  @ApiOperation({
    summary: 'Get patient insurance coverage',
    description: 'Retrieve all active insurance policies for a patient'
  })
  @ApiParam({ name: 'patientId', description: 'Patient identifier (anonymized)' })
  @ApiResponse({
    status: 200,
    description: 'Patient insurance policies retrieved',
    schema: {
      example: [
        {
          id: 'insurance-uuid',
          payer: 'Medicare',
          memberId: 'MEM-123456',
          groupNumber: 'GRP-789',
          priority: 'primary',
          status: 'active'
        }
      ]
    }
  })
  async findByPatientId(@Param('patientId') patientId: string) {
    return this.insuranceService.findByPatientId(patientId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get insurance details',
    description: 'Retrieve complete insurance policy information'
  })
  @ApiParam({ name: 'id', description: 'Insurance UUID' })
  @ApiResponse({ status: 200, description: 'Insurance details retrieved' })
  @ApiResponse({ status: 404, description: 'Insurance not found' })
  async findById(@Param('id') id: string) {
    return this.insuranceService.findById(id);
  }

  @Post(':id/verify-benefits')
  @ApiOperation({
    summary: 'Verify specific benefits',
    description: 'Check coverage for specific service or procedure codes'
  })
  @ApiParam({ name: 'id', description: 'Insurance UUID' })
  @ApiResponse({
    status: 200,
    description: 'Benefits verified',
    schema: {
      example: {
        serviceType: 'consultation',
        cptCode: '99213',
        covered: true,
        copay: 25.00,
        coinsurance: 20,
        priorAuthRequired: false,
        allowedAmount: 125.00
      }
    }
  })
  async verifyBenefits(
    @Param('id') id: string,
    @Body() benefitsQuery: any,
  ) {
    return this.insuranceService.verifyBenefits(id, benefitsQuery);
  }

  @Get(':id/authorization-status')
  @ApiOperation({
    summary: 'Check prior authorization status',
    description: 'Query status of prior authorization requests'
  })
  @ApiParam({ name: 'id', description: 'Insurance UUID' })
  @ApiQuery({ name: 'authNumber', required: false, description: 'Authorization number' })
  @ApiResponse({ status: 200, description: 'Authorization status retrieved' })
  async getAuthorizationStatus(
    @Param('id') id: string,
    @Query('authNumber') authNumber?: string,
  ) {
    return this.insuranceService.getAuthorizationStatus(id, authNumber);
  }

  @Post('batch-verify')
  @ApiOperation({
    summary: 'Batch eligibility verification',
    description: 'Verify eligibility for multiple patients in a single request'
  })
  @ApiResponse({ status: 200, description: 'Batch verification completed' })
  async batchVerify(@Body() batchData: any) {
    return this.insuranceService.batchVerify(batchData);
  }

  @Get('reports/verification-summary')
  @ApiOperation({
    summary: 'Verification summary report',
    description: 'Generate summary of eligibility verifications performed'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({
    status: 200,
    description: 'Verification summary generated',
    schema: {
      example: {
        totalVerifications: 450,
        eligible: 425,
        ineligible: 25,
        eligibilityRate: 94.44,
        byPayer: [
          { payer: 'Medicare', total: 150, eligible: 148 }
        ]
      }
    }
  })
  async getVerificationSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.insuranceService.getVerificationSummary(startDate, endDate);
  }
}