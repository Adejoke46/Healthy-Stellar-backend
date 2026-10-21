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
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { PaymentService } from '../services/payment.service';
import { CreatePaymentDto, RefundPaymentDto, BatchPaymentDto } from '../dto/payment.dto';

@ApiTags('Payment Processing')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({
    summary: 'Process patient payment',
    description: 'Record and process payment for medical services. Supports multiple payment methods and automatically updates billing balance.'
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Payment processed successfully and applied to invoice',
    schema: {
      example: {
        id: 'payment-uuid',
        billingId: 'billing-uuid',
        amount: 250.00,
        paymentMethod: 'credit_card',
        status: 'completed',
        transactionId: 'TXN-2024-001'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid payment data or insufficient funds' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() createDto: CreatePaymentDto) {
    return this.paymentService.create(createDto);
  }

  @Post('batch')
  @Roles(UserRole.BILLING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Process batch payments',
    description: 'Process multiple payments in a single transaction for efficiency'
  })
  @ApiResponse({ status: 201, description: 'Batch payments processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — BILLING_STAFF or ADMIN role required' })
  async processBatch(@Body() batchDto: BatchPaymentDto) {
    return this.paymentService.processBatch(batchDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get payment details',
    description: 'Retrieve complete payment information including transaction details'
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Payment details retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findById(@Param('id') id: string) {
    return this.paymentService.findById(id);
  }

  @Get('billing/:billingId')
  @ApiOperation({
    summary: 'Get payments for invoice',
    description: 'Retrieve all payments applied to a specific billing invoice'
  })
  @ApiParam({ name: 'billingId', description: 'Billing UUID' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findByBillingId(@Param('billingId') billingId: string) {
    return this.paymentService.getPaymentsByBilling(billingId);
  }

  @Get('patient/:patientId')
  @ApiOperation({
    summary: 'Get patient payment history',
    description: 'Retrieve complete payment history for a patient'
  })
  @ApiParam({ name: 'patientId', description: 'Patient identifier (anonymized)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter from date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter to date' })
  @ApiResponse({ status: 200, description: 'Patient payment history retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — patients may only access their own records' })
  async findByPatientId(
    @Param('patientId') patientId: string,
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (req.user.role === UserRole.PATIENT && req.user.userId !== patientId) {
      throw new ForbiddenException('Patients can only access their own payment history');
    }
    return this.paymentService.getPaymentsByPatient(patientId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Post(':id/refund')
  @Roles(UserRole.BILLING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Process payment refund',
    description: 'Issue full or partial refund for a payment transaction'
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — BILLING_STAFF or ADMIN role required' })
  async refund(@Param('id') id: string, @Body() refundDto: RefundPaymentDto) {
    return this.paymentService.refund({ ...refundDto, paymentId: id });
  }

  @Put(':id/void')
  @Roles(UserRole.BILLING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Void payment transaction',
    description: 'Cancel a payment transaction before settlement'
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Payment voided successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — BILLING_STAFF or ADMIN role required' })
  async void(@Param('id') id: string, @Request() req: any) {
    return this.paymentService.voidPayment(id, req.user.userId);
  }

  @Get('reports/daily')
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({
    summary: 'Daily payment report',
    description: 'Generate daily payment collection report for financial reconciliation'
  })
  @ApiQuery({ name: 'date', required: false, description: 'Report date (default: today)' })
  @ApiResponse({
    status: 200,
    description: 'Daily payment report generated',
    schema: {
      example: {
        date: '2024-01-15',
        totalPayments: 15,
        totalAmount: 12500.00,
        byMethod: {
          credit_card: 8500.00,
          cash: 2000.00,
          check: 2000.00
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN or BILLING_STAFF role required' })
  async getDailyReport(@Query('date') date?: string) {
    return this.paymentService.getDailyPaymentSummary(date ? new Date(date) : new Date());
  }

  @Get('reports/reconciliation')
  @Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
  @ApiOperation({
    summary: 'Payment reconciliation report',
    description: 'Generate payment reconciliation report for accounting'
  })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Reconciliation report generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN or BILLING_STAFF role required' })
  async getReconciliationReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.paymentService.getReconciliationReport(startDate, endDate);
  }
}
