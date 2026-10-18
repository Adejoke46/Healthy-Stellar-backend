import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RecordVersionService } from './record-version.service';
import { AmendRecordDto } from './dto/amend-record.dto';

@ApiTags('Record Versions')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard)
@Controller('records/:id')
export class RecordVersionController {
  constructor(private readonly versionService: RecordVersionService) {}

  @Post('amend')
  @UseInterceptors(FileInterceptor('file'))
  amend(
    @Param('id') recordId: string,
    @Body() dto: AmendRecordDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const userId: string = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user identity could not be resolved');
    }
    const encryptedDek = dto.encryptedDek ?? '';
    return this.versionService.amend(recordId, dto, file, userId, encryptedDek);
  }

  @Get('versions')
  getVersionHistory(
    @Param('id') recordId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: any,
  ) {
    const userId: string = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user identity could not be resolved');
    }
    return this.versionService.getVersionHistory(recordId, userId, page, limit);
  }

  @Get('versions/:version')
  getSpecificVersion(
    @Param('id') recordId: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() req: any,
  ) {
    const userId: string = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user identity could not be resolved');
    }
    return this.versionService.getSpecificVersion(recordId, version, userId);
  }

  @Get()
  getRecord(
    @Param('id') recordId: string,
    @Query('version') versionParam: string,
    @Req() req: any,
  ) {
    const userId: string = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user identity could not be resolved');
    }
    const version = versionParam ? parseInt(versionParam, 10) : undefined;
    return this.versionService.getLatestOrVersion(recordId, userId, version);
  }
}
