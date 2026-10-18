import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { BillingService } from '../services/billing.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import {
  CreateBillingDto,
  UpdateBillingDto,
  AddLineItemDto,
  UpdateLineItemDto,
} from '../dto/billing.dto';

@ApiTags('Billing & Invoicing')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.BILLING_STAFF)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get('invoices/:id/pdf')
  @ApiOperation({
    summary: 'Download invoice PDF',
    description:
      'Generate and stream a structured patient invoice PDF (itemised charges, tax, total, payment reference).',
  })
  @ApiParam({ name: 'id', description: 'Billing record UUID' })
  @ApiResponse({ status: 200, description: 'Invoice PDF stream' })
  @ApiResponse({ status: 404, description: 'Billing invoice not found' })
  async getInvoicePdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.invoicePdfService.generateInvoicePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Get('invoices/:id/pdf-link')
  @ApiOperation({
    summary: 'Get signed invoice PDF download link',
    description: 'Persist the invoice PDF to file storage and return a time-limited signed URL.',
  })
  @ApiParam({ name: 'id', description: 'Billing record UUID' })
  @ApiResponse({ status: 200, description: 'Signed download URL generated' })
  async getInvoicePdfLink(@Param('id') id: string) {
    return this.invoicePdfService.storeInvoicePdf(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create patient billing invoice',
    description:
      'Generate a new billing invoice with line items for medical services rendered. Automatically calculates totals and assigns invoice number.',
  })
  @ApiBody({ type: CreateBillingDto })
  @ApiResponse({
    status: 201,
    description: 'Billing invoice created successfully with automated calculations',
    schema: {
      example: {
        id: 'billing-uuid',
        invoiceNumber: 'INV-2024-0001',
        patientId: 'patient-12345-anon',
        totalCharges: 1250.0,
        balance: 1250.0,
        status: 'open',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid billing data provided' })
  async create(@Body() createDto: CreateBillingDto) {
    return this.billingService.create(createDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve billing invoice by ID',
    description: 'Get complete billing details including line items and payment history',
  })
  @ApiParam({ name: 'id', description: 'Billing record UUID', example: 'billing-uuid' })
  @ApiResponse({ status: 200, description: 'Billing invoice retrieved with full details' })
  @ApiResponse({ status: 404, description: 'Billing invoice not found' })
  async findById(@Param('id') id: string) {
    return this.billingService.findById(id);
  }

  @Get('invoice/:invoiceNumber')
  @ApiOperation({
    summary: 'Retrieve billing by invoice number',
    description: 'Lookup billing record using human-readable invoice number',
  })
  @ApiParam({ name: 'invoiceNumber', description: 'Invoice number', example: 'INV-2024-0001' })
  @ApiResponse({ status: 200, description: 'Billing invoice retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Invoice number not found' })
  async findByInvoiceNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.billingService.findByInvoiceNumber(invoiceNumber);
  }

  @Get('patient/:patientId')
  @ApiOperation({
    summary: 'Get patient billing history',
    description: 'Retrieve all billing invoices for a specific patient with pagination',
  })
  @ApiParam({
    name: 'patientId',
    description: 'Patient identifier (anonymized)',
    example: 'patient-12345-anon',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Patient billing history retrieved',
    schema: {
      example: {
        data: [],
        total: 15,
        page: 1,
        limit: 20,
      },
    },
  })
  async findByPatientId(
    @Param('patientId') patientId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.billingService.findByPatientId(patientId, { page, limit });
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update billing invoice',
    description: 'Modify billing details. Totals are automatically recalculated.',
  })
  @ApiParam({ name: 'id', description: 'Billing ID' })
  @ApiResponse({ status: 200, description: 'Billing invoice updated successfully' })
  @ApiResponse({ status: 404, description: 'Billing invoice not found' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateBillingDto) {
    return this.billingService.update(id, updateDto);
  }

  @Post(':id/line-items')
  @ApiOperation({
    summary: 'Add service line item to invoice',
    description:
      'Add a new CPT/procedure code line item to existing billing. Automatically recalculates invoice totals.',
  })
  @ApiParam({ name: 'id', description: 'Billing ID' })
  @ApiResponse({ status: 201, description: 'Line item added and totals recalculated' })
  async addLineItem(@Param('id') id: string, @Body() lineItemDto: AddLineItemDto) {
    return this.billingService.addLineItem(id, lineItemDto);
  }

  @Put('line-items/:lineItemId')
  @ApiOperation({
    summary: 'Update billing line item',
    description: 'Modify service line item details and charges',
  })
  @ApiParam({ name: 'lineItemId', description: 'Line item UUID' })
  @ApiResponse({ status: 200, description: 'Line item updated successfully' })
  async updateLineItem(
    @Param('lineItemId') lineItemId: string,
    @Body() updateDto: UpdateLineItemDto,
  ) {
    return this.billingService.updateLineItem(lineItemId, updateDto);
  }

  @Delete('line-items/:lineItemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove line item from invoice',
    description: 'Delete a service line item and recalculate invoice totals',
  })
  @ApiParam({ name: 'lineItemId', description: 'Line item UUID' })
  @ApiResponse({ status: 204, description: 'Line item removed successfully' })
  async removeLineItem(@Param('lineItemId') lineItemId: string) {
    return this.billingService.removeLineItem(lineItemId);
  }

  @Post(':id/recalculate')
  @ApiOperation({
    summary: 'Recalculate invoice totals',
    description: 'Manually trigger recalculation of charges, adjustments, payments, and balance',
  })
  @ApiParam({ name: 'id', description: 'Billing ID' })
  @ApiResponse({ status: 200, description: 'Invoice totals recalculated successfully' })
  async recalculateTotals(@Param('id') id: string) {
    return this.billingService.recalculateTotals(id);
  }

  @Get('outstanding/list')
  @ApiOperation({
    summary: 'Get outstanding patient balances',
    description: 'Retrieve all open invoices with outstanding balances for collections management',
  })
  @ApiQuery({
    name: 'minBalance',
    required: false,
    type: Number,
    description: 'Minimum balance threshold',
  })
  @ApiQuery({
    name: 'maxDays',
    required: false,
    type: Number,
    description: 'Maximum days since service date',
  })
  @ApiResponse({
    status: 200,
    description: 'Outstanding balances retrieved for revenue cycle management',
    schema: {
      example: [
        {
          id: 'billing-uuid',
          invoiceNumber: 'INV-2024-0001',
          patientId: 'patient-12345-anon',
          balance: 850.0,
          daysOutstanding: 45,
        },
      ],
    },
  })
  async getOutstandingBalances(
    @Query('minBalance') minBalance?: number,
    @Query('maxDays') maxDays?: number,
  ) {
    return this.billingService.getOutstandingBalances({ minBalance, maxDays });
  }

  @Put(':id/collections')
  @ApiOperation({
    summary: 'Send invoice to collections',
    description: 'Mark billing as sent to collections agency for delinquent accounts',
  })
  @ApiParam({ name: 'id', description: 'Billing ID' })
  @ApiResponse({ status: 200, description: 'Invoice marked for collections successfully' })
  async markAsSentToCollections(@Param('id') id: string) {
    return this.billingService.markAsSentToCollections(id);
  }

  @Get('reports/aging')
  @ApiOperation({
    summary: 'Generate A/R aging report',
    description: 'Accounts receivable aging analysis by 30-day buckets for financial reporting',
  })
  @ApiResponse({
    status: 200,
    description: 'Aging report with outstanding balances by time period',
    schema: {
      example: {
        current: { count: 45, total: 12500.0 },
        days30: { count: 23, total: 8750.0 },
        days60: { count: 12, total: 4200.0 },
        days90: { count: 8, total: 2100.0 },
        days120Plus: { count: 5, total: 1500.0 },
      },
    },
  })
  async getAgingReport() {
    return this.billingService.getAgingReport();
  }
}
