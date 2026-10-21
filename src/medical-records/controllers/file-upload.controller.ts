import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';
import { FileUploadService } from '../services/file-upload.service';
import { AttachmentType } from '../entities/medical-attachment.entity';
import { UploadValidationPipe, ALLOWED_MIME_TYPES } from '../pipes/upload-validation.pipe';
import { Response } from 'express';

/** 100 MB — must match UPLOAD_MAX_FILE_SIZE_BYTES env default */
const MULTER_SIZE_LIMIT = 100 * 1024 * 1024;

@ApiTags('File Attachments')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attachments')
export class FileUploadController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Post('upload')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 uploads / min per client
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MULTER_SIZE_LIMIT,
        files: 1,
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a medical file attachment (streamed, validated)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'recordId', 'attachmentType'],
      properties: {
        file: { type: 'string', format: 'binary' },
        recordId: { type: 'string' },
        attachmentType: { type: 'string', enum: Object.values(AttachmentType) },
        description: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or content mismatch' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 413, description: 'File exceeds size limit' })
  @ApiResponse({ status: 429, description: 'Upload rate limit exceeded' })
  async uploadFile(
    @UploadedFile(UploadValidationPipe) file: Express.Multer.File,
    @Query('recordId') recordId: string,
    @Query('attachmentType') attachmentType: AttachmentType,
    @Query('description') description: string | undefined,
    @Req() req: any,
  ) {
    const uploadedBy: string = req.user.userId;
    const uploadedByIp: string = req.ip ?? req.connection?.remoteAddress;
    return this.fileUploadService.uploadFile(
      file,
      recordId,
      attachmentType,
      description,
      uploadedBy,
      uploadedByIp,
    );
  }

  @Get('record/:recordId')
  @ApiOperation({ summary: 'Get all attachments for a medical record' })
  @ApiResponse({ status: 200, description: 'Attachments retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getByRecord(@Param('recordId') recordId: string) {
    return this.fileUploadService.findByRecord(recordId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an attachment by ID' })
  @ApiResponse({ status: 200, description: 'Attachment retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async findOne(@Param('id') id: string) {
    return this.fileUploadService.findOne(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download an attachment file' })
  @ApiResponse({ status: 200, description: 'File streamed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { stream, attachment } = await this.fileUploadService.getFileStream(id);
    const encodedFilename = encodeURIComponent(attachment.originalFileName);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', attachment.fileSize);
    stream.pipe(res);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MEDICAL_RECORDS)
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiResponse({ status: 200, description: 'Attachment deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN or MEDICAL_RECORDS role required' })
  async delete(@Param('id') id: string) {
    await this.fileUploadService.delete(id);
  }
}
