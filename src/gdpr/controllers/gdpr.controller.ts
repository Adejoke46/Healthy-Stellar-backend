import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Res,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Response } from 'express';
import { GdprService } from '../services/gdpr.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuditLog } from '../../common/audit/audit-log.decorator';
import { ThrottlerBehindProxyGuard } from '../../common/throttler/throttler-behind-proxy.guard';
import { RateLimit } from '../../common/throttler/throttler.decorator';
import { CreateErasureRequestDto } from '../dto/create-erasure-request.dto';
import { GdprRequest } from '../entities/gdpr-request.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { verifySignedUrl } from '../../fhir/utils/signed-url.util';
import { GdprProcessor } from '../processors/gdpr.processor';
import * as fs from 'fs';

@ApiTags('GDPR Data Subject Rights')
@Controller('gdpr')
@UseGuards(JwtAuthGuard, ThrottlerBehindProxyGuard)
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class GdprController {
  constructor(
    private readonly gdprService: GdprService,
    @InjectRepository(GdprRequest)
    private readonly gdprRequestRepository: Repository<GdprRequest>,
  ) {}

  @Post(['data-export-request', 'export-request'])
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(5, 60)
  @ApiOperation({ summary: 'Request a full export of user data' })
  @ApiResponse({ status: 202, description: 'Export request queued' })
  @ApiResponse({ status: 409, description: 'A pending or in-progress request already exists' })
  @AuditLog('GDPR_EXPORT_REQUEST', 'GdprRequest')
  async requestDataExport(@Req() req) {
    const userId = req.user.id;
    return this.gdprService.createExportRequest(userId);
  }

  @Post(['erasure-request', 'erasure-requests'])
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(3, 60)
  @ApiOperation({ summary: 'Submit a right-to-erasure request' })
  @ApiResponse({ status: 202, description: 'Erasure request queued' })
  @ApiResponse({ status: 409, description: 'A pending or in-progress request already exists' })
  @AuditLog('GDPR_ERASURE_REQUEST', 'GdprRequest')
  async requestErasure(@Req() req, @Body() dto?: CreateErasureRequestDto) {
    const userId = req.user.id;
    return this.gdprService.createErasureRequest(userId, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'List all submitted GDPR requests and their status' })
  @ApiResponse({ status: 200, description: 'List of GDPR requests' })
  async getRequests(@Req() req) {
    const userId = req.user.id;
    return this.gdprService.getRequestsByUser(userId);
  }

  @Get('erasure-request/preview')
  @ApiOperation({
    summary: 'Dry-run a right-to-erasure request',
    description:
      'Lists, per module, what an erasure request would delete or anonymise — without deleting anything.',
  })
  @ApiResponse({ status: 200, description: 'Per-module deletion preview' })
  async previewErasure(@Req() req) {
    const userId = req.user.id;
    return this.gdprService.previewErasure(userId);
  }

  @Get('export-files/:requestId/dsar-bundle.json')
  @ApiOperation({ summary: 'Download a completed GDPR data export bundle' })
  @ApiResponse({ status: 200, description: 'Export bundle downloaded' })
  @ApiResponse({ status: 400, description: 'Invalid or expired download URL' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Export not found' })
  @ApiQuery({ name: 'expires', type: 'string', description: 'URL expiry timestamp' })
  @ApiQuery({ name: 'sig', type: 'string', description: 'HMAC signature' })
  async downloadExport(
    @Param('requestId') requestId: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Req() req,
    @Res() res: Response,
  ) {
    const userId = req.user.id;

    const request = await this.gdprRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Export request not found');
    }

    if (request.userId !== userId) {
      throw new ForbiddenException('You do not have access to this export');
    }

    const url = `/gdpr/export-files/${requestId}/dsar-bundle.json?expires=${expires}&sig=${sig}`;
    if (!verifySignedUrl(url)) {
      throw new BadRequestException('Invalid or expired download URL');
    }

    const filePath = GdprProcessor.getExportFilePath(requestId);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('Export file no longer available');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gdpr-export-${requestId}.json"`,
    );

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('close', () => {
      GdprProcessor.deleteExportFile(requestId).catch(() => {});
    });
  }
}
