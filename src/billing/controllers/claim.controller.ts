import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { ClaimService } from '../services/claim.service';
import { CreateClaimDto, UpdateClaimDto, SubmitClaimDto } from '../dto/claim.dto';

@ApiTags('Insurance Claims')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('claims')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Post()
  @ApiOperation({
    summary: 'Create insurance claim',
    description: 'Generate new insurance claim for medical services. Validates eligibility and coding before submission.'
  })
  @ApiResponse({
    status: 201,
    description: 'Insurance claim created successfully',
    schema: {
      example: {
        id: 'claim-uuid',
        claimNumber: 'CLM-2024-0001',
        billingId: 'billing-uuid',
        insuranceId: 'insurance-uuid',
        status: 'draft',
        totalAmount: 1250.00
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid claim data or eligibility issue' })
  async create(@Body() createDto: CreateClaimDto) {
    return this.claimService.create(createDto);
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Submit claim to insurance',
    description: 'Submit claim electronically to insurance payer via EDI 837 format'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim submitted successfully to payer' })
  @ApiResponse({ status: 400, description: 'Claim validation failed' })
  async submit(@Param('id') id: string, @Body() submitDto: SubmitClaimDto) {
    return this.claimService.submit({ ...submitDto, id });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get claim details',
    description: 'Retrieve complete claim information including status and adjudication'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim details retrieved' })
  @ApiResponse({ status: 404, description: 'Claim not found' })
  async findById(@Param('id') id: string) {
    return this.claimService.findById(id);
  }

  @Get('billing/:billingId')
  @ApiOperation({
    summary: 'Get claims for billing',
    description: 'Retrieve all insurance claims associated with a billing invoice'
  })
  @ApiParam({ name: 'billingId', description: 'Billing UUID' })
  @ApiResponse({ status: 200, description: 'Claims retrieved successfully' })
  async findByBillingId(@Param('billingId') billingId: string) {
    return this.claimService.findByBillingId(billingId);
  }

  @Get('patient/:patientId')
  @ApiOperation({
    summary: 'Get patient claim history',
    description: 'Retrieve all insurance claims for a patient'
  })
  @ApiParam({ name: 'patientId', description: 'Patient identifier (anonymized)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by claim status' })
  @ApiResponse({ status: 200, description: 'Patient claims retrieved' })
  async findByPatientId(
    @Param('patientId') patientId: string,
    @Query('status') status?: string,
  ) {
    return this.claimService.findByPatientId(patientId, status);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update claim information',
    description: 'Modify claim details before submission or for resubmission'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim updated successfully' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateClaimDto) {
    return this.claimService.update(id, updateDto);
  }

  @Post(':id/resubmit')
  @ApiOperation({
    summary: 'Resubmit denied claim',
    description: 'Resubmit a previously denied or rejected claim with corrections'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 200, description: 'Claim resubmitted successfully' })
  async resubmit(@Param('id') id: string) {
    return this.claimService.resubmit(id);
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Check claim status',
    description: 'Query real-time claim status from insurance payer via EDI 276/277'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: 200,
    description: 'Claim status retrieved from payer',
    schema: {
      example: {
        claimId: 'claim-uuid',
        status: 'in_process',
        payerStatus: 'Pending Review',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    }
  })
  async checkStatus(@Param('id') id: string) {
    return this.claimService.checkStatus(id);
  }

  @Post(':id/appeal')
  @ApiOperation({
    summary: 'Appeal denied claim',
    description: 'Initiate appeal process for denied insurance claim'
  })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({ status: 201, description: 'Appeal initiated successfully' })
  async appeal(@Param('id') id: string, @Body() appealData: any) {
    return this.claimService.appeal(id, appealData);
  }

  @Get('reports/submission')
  @ApiOperation({
    summary: 'Claim submission report',
    description: 'Generate report of claim submissions and acceptance rates'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({
    status: 200,
    description: 'Submission report generated',
    schema: {
      example: {
        totalSubmitted: 150,
        accepted: 142,
        rejected: 8,
        acceptanceRate: 94.67,
        totalAmount: 187500.00
      }
    }
  })
  async getSubmissionReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.claimService.getSubmissionReport(startDate, endDate);
  }

  @Get('reports/denial-analysis')
  @ApiOperation({
    summary: 'Claim denial analysis',
    description: 'Analyze denial patterns and reasons for revenue cycle optimization'
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiResponse({
    status: 200,
    description: 'Denial analysis report generated',
    schema: {
      example: {
        totalDenials: 25,
        denialRate: 16.67,
        topReasons: [
          { reason: 'Missing information', count: 10 },
          { reason: 'Authorization required', count: 8 }
        ],
        recoveryOpportunity: 18750.00
      }
    }
  })
  async getDenialAnalysis(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.claimService.getDenialAnalysis(startDate, endDate);
  }

  @Get('dashboard/status-aging')
  @ApiOperation({
    summary: 'Claims dashboard',
    description: 'Claim counts grouped by status plus aging buckets (0-30/31-60/61-90/90+) for unresolved claims',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved' })
  async getDashboard() {
    return this.claimService.getClaimsDashboard();
  }

  @Get('pending/review')
  @ApiOperation({
    summary: 'Get pending claims',
    description: 'Retrieve claims pending review or action for workflow management'
  })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority level' })
  @ApiResponse({ status: 200, description: 'Pending claims retrieved' })
  async getPendingClaims(@Query('priority') priority?: string) {
    return this.claimService.getPendingClaims();
  }
}