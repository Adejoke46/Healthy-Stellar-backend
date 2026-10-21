import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../../common/constants/swagger.constants';
import { Throttle } from '@nestjs/throttler';
import { TenantBrandingService } from '../services/tenant-branding.service';
import { UpdateTenantBrandingDto } from '../dto/update-tenant-branding.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@ApiTags('admin/tenants')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TenantBrandingController {
  constructor(private readonly brandingService: TenantBrandingService) {}

  @Get(':id/branding')
  @ApiOperation({ summary: 'Get tenant branding configuration' })
  async getBranding(@Param('id', ParseUUIDPipe) tenantId: string) {
    return this.brandingService.getBranding(tenantId);
  }

  @Put(':id/branding')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Update tenant branding (logo URL, colors, domain, support contact)' })
  async updateBranding(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantBrandingDto,
    @Request() req,
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.brandingService.upsertBranding(tenantId, dto, userId);
  }

  @Post(':id/branding/logo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Upload and validate tenant logo (PNG/JPEG/SVG/WebP, max 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    this.brandingService.validateLogoUpload({
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });

    // After validation the caller stores the file and provides the URL via PUT /branding.
    // Return metadata so the client can confirm and then call PUT with the hosted logoUrl.
    return {
      message: 'Logo validated successfully. Use PUT /branding with the hosted logoUrl to save.',
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }
}
