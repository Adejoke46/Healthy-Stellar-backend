import { Controller, Post, Body, HttpCode, Inject, Logger, Get, Param, UseGuards, Req, Query, Delete, NotFoundException, ForbiddenException, Put, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { IpfsService } from '../stellar/services/ipfs.service';
import { QueueService } from '../queues/queue.service';
import { ConfigService } from '@nestjs/config';
import { WebhookDeliveryService } from './services/webhook-delivery.service';
import { WebhookSubscriptionService } from './services/webhook-subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto } from './dto/webhook-subscription.dto';
import { Repository } from 'typeorm';
import { WebhookDelivery, WebhookDeliveryStatus } from './entities/webhook-delivery.entity';
import { ClaimService } from '../billing/services/claim.service';
import { AdjudicationWebhookDto } from '../billing/dto/claim.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly ipfsService: IpfsService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookDeliveryService,
    private readonly subscriptionService: WebhookSubscriptionService,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    private readonly claimService: ClaimService,
  ) {}

  // ── Tenant Self-Service Subscription Management ───────────────────────────

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'List webhook subscriptions for the authenticated tenant' })
  async listSubscriptions(@Req() req: any) {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    return this.subscriptionService.listSubscriptions(tenantId);
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Create a new webhook subscription (includes validation ping)' })
  @ApiBody({ type: CreateWebhookSubscriptionDto })
  async createSubscription(@Req() req: any, @Body() dto: CreateWebhookSubscriptionDto) {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    const userId = req.user?.id;
    this.subscriptionService.assertEventsAllowedForRole(req.user?.role, dto.events);
    return this.subscriptionService.createSubscription(tenantId, userId, dto);
  }

  @Put('subscriptions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Update a webhook subscription' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateWebhookSubscriptionDto })
  async updateSubscription(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookSubscriptionDto,
  ) {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    const userId = req.user?.id;
    if (dto.events !== undefined) {
      this.subscriptionService.assertEventsAllowedForRole(req.user?.role, dto.events);
    }
    return this.subscriptionService.updateSubscription(tenantId, id, userId, dto);
  }

  @Delete('subscriptions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Delete a webhook subscription' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubscription(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    const userId = req.user?.id;
    await this.subscriptionService.deleteSubscription(tenantId, id, userId);
  }

  @Post('subscriptions/:id/rotate-secret')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Rotate the HMAC signing secret for a webhook subscription' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.OK)
  async rotateSubscriptionSecret(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    const userId = req.user?.id;
    return this.subscriptionService.rotateSecret(tenantId, id, userId);
  }

  @Post('insurance-claims')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive payer adjudication callback and update claim status' })
  async handleInsuranceClaimAdjudication(@Body() payload: AdjudicationWebhookDto) {
    this.logger.log(`Received insurance claim adjudication webhook for claim ${payload.claimNumber}`);
    const claim = await this.claimService.handleAdjudicationWebhook(payload);
    return { received: true, claimNumber: claim.claimNumber, status: claim.status };
  }

  @Post('ipfs')
  @HttpCode(200)
  async handleIpfsWebhook(@Body() payload: any) {
    this.logger.log(`Received IPFS webhook: ${JSON.stringify(payload)}`);
    
    // Handle IPFS pinning service webhook
    // Extract CID from payload and dispatch for processing
    const cid = payload?.cid || payload?.ipfs_hash || payload?.hash;
    if (!cid) {
      this.logger.warn('IPFS webhook received without CID');
      return { received: false, error: 'Missing CID in payload' };
    }
    
    try {
      // Dispatch IPFS upload job for processing
      await this.queueService.dispatchIpfsUpload({
        cid,
        payload,
        correlationId: `ipfs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
      
      this.logger.log(`IPFS webhook processed successfully for CID: ${cid}`);
      return { received: true, cid, status: 'queued_for_processing' };
    } catch (error) {
      this.logger.error(`Failed to process IPFS webhook for CID ${cid}: ${error.message}`, error.stack);
      return { received: false, error: error.message };
    }
  }

  @Post('stellar')
  @HttpCode(200)
  async handleStellarWebhook(@Body() payload: any) {
    this.logger.log(`Received Stellar webhook: ${JSON.stringify(payload)}`);
    
    // Handle Stellar payment processor webhook
    // Extract transaction details and dispatch for reconciliation
    const txHash = payload?.transaction_hash || payload?.tx_hash || payload?.hash;
    const ledger = payload?.ledger || payload?.ledger_sequence;
    const operationType = payload?.operation_type || 'payment';
    
    if (!txHash) {
      this.logger.warn('Stellar webhook received without transaction hash');
      return { received: false, error: 'Missing transaction hash in payload' };
    }
    
    try {
      // Dispatch Stellar transaction job for processing
      await this.queueService.dispatchStellarTransaction({
        operationType,
        params: {
          txHash,
          ledger,
          payload,
        },
        initiatedBy: 'webhook',
        correlationId: `stellar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
      
      this.logger.log(`Stellar webhook processed successfully for transaction: ${txHash}`);
      return { received: true, txHash, status: 'queued_for_reconciliation' };
    } catch (error) {
      this.logger.error(`Failed to process Stellar webhook for transaction ${txHash}: ${error.message}`, error.stack);
      return { received: false, error: error.message };
    }
  }

  // ── Admin: Deliveries Management ──────────────────────────────────────────

  private tenantIdOf(req: any): string {
    const tenantId = req.user?.tenantId ?? req.user?.organizationId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return tenantId;
  }

  private async assertTenantDelivery(deliveryId: string, tenantId: string): Promise<void> {
    const exists = await this.deliveryRepository.exist({ where: { id: deliveryId, tenantId } });
    if (!exists) {
      throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    }
  }

  @Get('deliveries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'List webhook deliveries, optionally filtered by status' })
  @ApiQuery({ name: 'status', required: false, enum: WebhookDeliveryStatus })
  @ApiQuery({ name: 'subscriptionId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listDeliveries(
    @Req() req: any,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const where: any = { tenantId: this.tenantIdOf(req) };
    if (status) where.status = status;
    if (subscriptionId) where.subscriptionId = subscriptionId;

    const [items, total] = await this.deliveryRepository.findAndCount({
      where,
      relations: ['subscription'],
      skip: offset ? parseInt(offset, 10) : 0,
      take: limit ? Math.min(parseInt(limit, 10), 100) : 50,
      order: { createdAt: 'DESC' },
    });

    return { items, total };
  }

  @Get(':id/deliveries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Get the delivery attempt history for a webhook delivery' })
  @ApiParam({ name: 'id', type: String })
  async getDeliveryHistory(@Req() req: any, @Param('id') id: string) {
    const delivery = await this.deliveryRepository.findOne({
      where: { id, tenantId: this.tenantIdOf(req) },
      relations: ['subscription'],
    });

    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${id} not found`);
    }

    return delivery;
  }

  @Post('deliveries/:id/replay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Manually replay a failed webhook delivery (signature re-computed)' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(200)
  async replayDelivery(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || 'unknown';
    await this.assertTenantDelivery(id, this.tenantIdOf(req));
    await this.webhookService.replayDelivery(id, userId);
    return { success: true, message: 'Webhook delivery queued for replay' };
  }

  // ── Dead-Letter Queue Management ──────────────────────────────────────────

  @Get('dead-letter')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'List failed webhook deliveries (dead-letter queue)' })
  @ApiQuery({ name: 'status', required: false, enum: WebhookDeliveryStatus })
  @ApiQuery({ name: 'subscriptionId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getDeadLetterQueue(
    @Req() req: any,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const where: any = { tenantId: this.tenantIdOf(req) };
    if (status) where.status = status;
    if (subscriptionId) where.subscriptionId = subscriptionId;

    const [items, total] = await this.deliveryRepository.findAndCount({
      where,
      relations: ['subscription'],
      skip: offset ? parseInt(offset, 10) : 0,
      take: limit ? Math.min(parseInt(limit, 10), 100) : 50,
      order: { createdAt: 'DESC' },
    });

    return { items, total };
  }

  @Get('dead-letter/:deliveryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Get details of a failed webhook delivery' })
  @ApiParam({ name: 'deliveryId', type: String })
  async getDeadLetterItem(@Req() req: any, @Param('deliveryId') deliveryId: string) {
    return this.deliveryRepository.findOne({
      where: { id: deliveryId, tenantId: this.tenantIdOf(req) },
      relations: ['subscription'],
    });
  }

  @Post('dead-letter/:deliveryId/replay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Replay a failed webhook delivery from dead-letter queue' })
  @ApiParam({ name: 'deliveryId', type: String })
  @HttpCode(200)
  async replayDeadLetterItem(
    @Param('deliveryId') deliveryId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'unknown';
    await this.assertTenantDelivery(deliveryId, this.tenantIdOf(req));
    await this.webhookService.replayDelivery(deliveryId, userId);
    return { success: true, message: 'Webhook delivery queued for replay' };
  }

  @Delete('dead-letter/:deliveryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Discard a failed webhook delivery' })
  @ApiParam({ name: 'deliveryId', type: String })
  @HttpCode(200)
  async discardDeadLetterItem(
    @Req() req: any,
    @Param('deliveryId') deliveryId: string,
  ) {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId, tenantId: this.tenantIdOf(req) },
    });

    if (!delivery) {
      return { error: 'Delivery not found', success: false };
    }

    delivery.status = WebhookDeliveryStatus.FAILED; // Mark as discarded
    await this.deliveryRepository.save(delivery);

    return { success: true, message: 'Webhook delivery discarded' };
  }
}

