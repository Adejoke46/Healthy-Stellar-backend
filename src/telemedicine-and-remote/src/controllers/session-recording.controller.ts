import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../../common/constants/swagger.constants';
import { SessionRecordingService } from '../services/session-recording.service';
import { MedicalRoles } from '../../../roles/medical-rbac.decorator';
import { MedicalRole } from '../../../roles/medical-roles.enum';
import { MedicalRbacGuard } from '../../../roles/medical-rbac.guard';

@ApiTags('Telemedicine Recordings')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('telemedicine/sessions')
export class SessionRecordingController {
  constructor(private readonly sessionRecordingService: SessionRecordingService) {}

  @Post(':id/recording')
  @UseGuards(MedicalRbacGuard)
  @MedicalRoles(MedicalRole.DOCTOR, MedicalRole.NURSE, MedicalRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload an encrypted telemedicine session recording' })
  @ApiParam({ name: 'id', description: 'Video conference session UUID' })
  @ApiResponse({ status: 201, description: 'Recording stored, encrypted at rest' })
  @ApiResponse({ status: 400, description: 'Recording file is required' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async uploadRecording(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Recording file is required');
    }

    const uploadedBy = req.medicalUser?.id ?? req.user?.id;
    const recording = await this.sessionRecordingService.uploadRecording(id, file, uploadedBy);
    return {
      id: recording.id,
      sessionId: recording.sessionId,
      fileSize: recording.fileSize,
      retentionExpiresAt: recording.retentionExpiresAt,
    };
  }

  @Get(':id/recording')
  @UseGuards(MedicalRbacGuard)
  @MedicalRoles(MedicalRole.DOCTOR, MedicalRole.NURSE, MedicalRole.ADMIN)
  @ApiOperation({ summary: 'Get a time-limited signed URL to stream the session recording' })
  @ApiParam({ name: 'id', description: 'Video conference session UUID' })
  @ApiResponse({ status: 200, description: 'Signed, time-limited download URL' })
  @ApiResponse({ status: 404, description: 'No recording found for this session' })
  async getRecordingUrl(@Param('id') id: string) {
    return this.sessionRecordingService.getSignedRecordingUrl(id);
  }

  @Get(':id/recording/stream')
  @ApiOperation({
    summary: 'Stream the decrypted recording (requires a valid signed URL from GET .../recording)',
  })
  @ApiParam({ name: 'id', description: 'Video conference session UUID' })
  @ApiResponse({ status: 200, description: 'Decrypted recording stream' })
  @ApiResponse({ status: 403, description: 'Missing or expired signature' })
  async streamRecording(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!this.sessionRecordingService.verifySignedUrl(id, expires, sig)) {
      throw new ForbiddenException('Missing, invalid, or expired signature');
    }

    const { buffer, mimeType, filename } = await this.sessionRecordingService.getDecryptedRecording(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
