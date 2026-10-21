import {
  Controller, Post, Get, Param, UseGuards, UploadedFile,
  UseInterceptors, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../../auth/entities/user.entity';
import { RecordingService } from '../services/recording.service';

@ApiTags('telemedicine/recordings')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('telemedicine/sessions')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  @Post(':id/recording')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN)
  @ApiOperation({ summary: 'Upload encrypted session recording' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.recordingService.uploadRecording(sessionId, file, req.user?.id ?? 'unknown');
  }

  @Get(':id/recording/url')
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.PATIENT)
  @ApiOperation({ summary: 'Generate a 15-minute signed playback URL for a session recording' })
  async getPlaybackUrl(@Param('id') sessionId: string, @Request() req: any) {
    const userRole = req.user?.role ?? '';
    const userId = req.user?.id ?? '';
    return this.recordingService.getSignedUrl(sessionId, userRole, userId);
  }
}
