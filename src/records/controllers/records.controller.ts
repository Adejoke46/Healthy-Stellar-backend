import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { RecordsService } from '../services/records.service';
import { RecordDownloadService } from '../services/record-download.service';
import { RecordAttachmentUploadService } from '../services/record-attachment-upload.service';
import { RelatedRecordsService } from '../services/related-records.service';
import { RecordVersionService } from '../services/record-version.service';
import { RecordDiffService } from '../services/record-diff.service';
import { CreateRecordDto } from '../dto/create-record.dto';
import { CreateAttachmentDto } from '../dto/create-attachment.dto';
import { AmendRecordDto } from '../dto/amend-record.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedRecordsResponseDto } from '../dto/paginated-response.dto';
import { RecentRecordDto } from '../dto/recent-record.dto';
import { RelatedRecordDto } from '../dto/related-record.dto';
import { SearchRecordsDto } from '../dto/search-records.dto';
import { SearchRecordsResponseDto } from '../dto/search-records-response.dto';
import {
  AmendRecordResponseDto,
  PaginatedVersionsResponseDto,
  RecordVersionMetaDto,
} from '../dto/record-version-response.dto';
import { RecordDiffResponseDto } from '../dto/record-diff.dto';
import { MedicalRoles } from '../../roles/medical-rbac.decorator';
import { MedicalRole } from '../../roles/medical-roles.enum';
import { MedicalRbacGuard } from '../../roles/medical-rbac.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtPayload } from '../../auth/services/auth-token.service';
import { RecordResponseDto } from '../dto/record-response.dto';
import { AttachmentResponseDto } from '../dto/attachment-response.dto';
import { RecordAccessGuard } from '../guards/record-access.guard';
import { DeprecatedRoute } from '../../common/decorators/deprecated.decorator';

@ApiTags('Records')
@Controller({ path: 'records', version: '1' })
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly recordDownloadService: RecordDownloadService,
    private readonly recordAttachmentUploadService: RecordAttachmentUploadService,
    private readonly relatedRecordsService: RelatedRecordsService,
    private readonly recordVersionService: RecordVersionService,
    private readonly recordDiffService: RecordDiffService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a new medical record' })
  @ApiResponse({ status: 201, description: 'Record uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async uploadRecord(
    @Body() dto: CreateRecordDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Encrypted record file is required');
    }

    const providerId = req.user?.userId || req.user?.id;
    return this.recordsService.uploadRecord(dto, file.buffer, providerId);
  }

  @Get()
  @DeprecatedRoute({
    sunsetDate: 'Wed, 01 Jan 2026 00:00:00 GMT',
    alternativeRoute: '/v1/records/search',
    reason: 'Use GET /v1/records/search for richer filtering. This endpoint will be removed in v2.',
  })
  @ApiOperation({ summary: 'List all medical records with pagination, filtering, and sorting' })
  @ApiResponse({
    status: 200,
    description: 'Records retrieved successfully',
    type: PaginatedRecordsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid query parameters' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'recordType',
    required: false,
    enum: ['MEDICAL_REPORT', 'LAB_RESULT', 'PRESCRIPTION', 'IMAGING', 'CONSULTATION'],
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({ name: 'toDate', required: false, type: String, description: 'End date (ISO 8601)' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'recordType', 'patientId'],
    description: 'Sort field (default: createdAt)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (default: desc)',
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    type: String,
    description: 'Filter by patient ID',
  })
  async findAll(@Query() query: PaginationQueryDto): Promise<PaginatedRecordsResponseDto> {
    return this.recordsService.findAll(query);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Search records with dynamic filtering',
    description:
      'Admin/Physician can search all records. Patients are automatically scoped to their own records. ' +
      'Raw IPFS CIDs are only returned to the record owner.',
  })
  @ApiResponse({ status: 200, description: 'Search results', type: SearchRecordsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async searchRecords(
    @Query() dto: SearchRecordsDto,
    @Req() req: any,
  ): Promise<SearchRecordsResponseDto> {
    const callerId: string = req.user?.userId ?? req.user?.id;
    const callerRole: string = req.user?.role ?? '';
    return this.recordsService.search(dto, callerId, callerRole);
  }

  @Get(':id/qr-code')
  @ApiOperation({ summary: 'Generate a QR code for a one-time share link (patient only)' })
  @ApiResponse({ status: 200, description: 'Base64 PNG QR code' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getQrCode(@Param('id') id: string, @Req() req: any) {
    const patientId = req.user?.userId || req.user?.id;
    const qrBase64 = await this.recordsService.generateQrCode(id, patientId);
    return { qrCode: qrBase64 };
  }

  @Get('recent')
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @UseGuards(JwtAuthGuard, MedicalRbacGuard)
  @MedicalRoles(MedicalRole.ADMIN)
  @ApiOperation({ summary: 'Get latest platform activity (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Recent records retrieved successfully',
    type: [RecentRecordDto],
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getRecent(@Req() req: any): Promise<RecentRecordDto[]> {
    // Populate request.medicalUser from the authenticated JWT so that
    // MedicalRbacGuard.canActivate() can read it instead of always throwing.
    if (!req.medicalUser && req.user) {
      req.medicalUser = {
        id: req.user.userId ?? req.user.id,
        role: req.user.role,
      };
    }
    return this.recordsService.findRecent();
  }

  // ── Versioning endpoints ────────────────────────────────────────────────────

  @Post(':id/amend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Amend a record — upload a new version',
    description:
      'Creates a new immutable version of the record. ' +
      'Only the record owner may amend. Requires a file upload and a reason (min 20 chars). ' +
      'Anchors the new CID on Stellar and notifies all active grantees.',
  })
  @ApiResponse({ status: 201, description: 'Amendment recorded', type: AmendRecordResponseDto })
  @ApiResponse({ status: 400, description: 'Missing file or invalid amendmentReason' })
  @ApiResponse({ status: 403, description: 'Not the record owner' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async amendRecord(
    @Param('id') id: string,
    @Body() dto: AmendRecordDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<AmendRecordResponseDto> {
    if (!file) {
      throw new BadRequestException('Encrypted record file is required');
    }
    const ownerId = req.user?.userId || req.user?.id;
    return this.recordVersionService.amendRecord(id, dto, file.buffer, ownerId);
  }

  @Get(':id/versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'List all versions of a record' })
  @ApiResponse({ status: 200, description: 'Versions retrieved', type: PaginatedVersionsResponseDto })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async listVersions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ): Promise<PaginatedVersionsResponseDto> {
    return this.recordVersionService.listVersions(id, page, pageSize);
  }

  @Get(':id/versions/:version')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Get metadata for a specific record version' })
  @ApiResponse({ status: 200, description: 'Version metadata', type: RecordVersionMetaDto })
  @ApiResponse({ status: 404, description: 'Record or version not found' })
  async getVersion(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<RecordVersionMetaDto> {
    return this.recordVersionService.getVersion(id, version);
  }

  @Get(':id/diff')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Diff two versions of a record' })
  @ApiResponse({ status: 200, description: 'Diff result', type: RecordDiffResponseDto })
  @ApiResponse({ status: 404, description: 'Record or version not found' })
  async diffVersions(
    @Param('id') id: string,
    @Query('from', ParseIntPipe) from: number,
    @Query('to', ParseIntPipe) to: number,
  ): Promise<RecordDiffResponseDto> {
    return this.recordDiffService.diff(id, from, to);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard, RecordAccessGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'Download a record (owner or granted user)' })
  @ApiResponse({ status: 200, description: 'Record file stream' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async downloadRecord(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user?.userId || req.user?.id;
    const { stream, filename, mimeType } = await this.recordDownloadService.download(id, userId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }

  @Post(':id/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Attach a file to a record' })
  @ApiResponse({ status: 201, description: 'Attachment created', type: AttachmentResponseDto })
  @ApiResponse({ status: 400, description: 'Missing file' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async addAttachment(
    @Param('id') id: string,
    @Body() dto: CreateAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<AttachmentResponseDto> {
    if (!file) {
      throw new BadRequestException('Attachment file is required');
    }
    const uploaderId = req.user?.userId || req.user?.id;
    return this.recordAttachmentUploadService.upload(id, dto, file.buffer, uploaderId);
  }

  @Get(':id/related')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({ summary: 'List records related to a record' })
  @ApiResponse({ status: 200, description: 'Related records', type: [RelatedRecordDto] })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getRelated(@Param('id') id: string): Promise<RelatedRecordDto[]> {
    return this.relatedRecordsService.findRelated(id);
  }
}
