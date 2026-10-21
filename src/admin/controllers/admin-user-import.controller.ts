import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PolicyGuard } from '../../rbac/guards/policy.guard';
import { RequireAdmin } from '../../rbac/decorators/policy.decorator';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { UserImportService } from '../services/user-import.service';

@ApiTags('Admin - User Import')
@Controller('admin/users/import')
@UseGuards(IpAllowlistGuard, JwtAuthGuard, PolicyGuard)
@RequireAdmin()
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
export class AdminUserImportController {
  constructor(private readonly importService: UserImportService) {}

  @Post()
  @ApiOperation({ summary: 'Bulk import users from CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 202, description: 'Import job accepted' })
  @ApiResponse({ status: 413, description: 'File exceeds 1000-row limit' })
  @ApiResponse({ status: 422, description: 'Row-level validation errors' })
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('CSV file is required');

    const user = req.user as any;
    const job = await this.importService.importFromCsv(file.buffer, user?.id);
    return { jobId: job.id, status: job.status, totalRows: job.totalRows };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll import job progress' })
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId', ParseUUIDPipe) jobId: string) {
    const job = await this.importService.getJob(jobId);
    return {
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successRows: job.successRows,
      failedRows: job.failedRows,
      rowErrors: job.rowErrors,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
