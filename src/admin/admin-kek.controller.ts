import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { IsOptional, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { KekRotationService, RotationResult } from '../services/kek-rotation.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class RotateKekDto {
  @IsOptional()
  @IsString()
  @Matches(/^arn:aws:kms:/, {
    message: 'newKekArn must be a valid AWS KMS ARN (arn:aws:kms:...)',
  })
  /**
   * Optional: supply only when you want to rotate to a *different* CMK.
   * Omit when using AWS automatic key rotation on the same CMK ARN.
   */
  newKekArn?: string;

  @IsOptional()
  batchSize?: number;
}

export class RotationResultDto implements RotationResult {
  tenantId: string;
  newKekVersion: string;
  totalAttachments: number;
  rewrapped: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Admin-only endpoints for KEK management.
 * Protect with your existing RBAC guard (e.g. RolesGuard + @Roles('admin')).
 *
 * Routes:
 *   POST /admin/tenants/:id/rotate-kek   – trigger rotation
 *   GET  /admin/tenants/:id/kek-status   – audit view (counts per kek_version)
 */
@ApiTags('Admin – Key Management')
@ApiBearerAuth(API_BEARER_AUTH_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/tenants')
export class AdminKekController {
  constructor(private readonly rotationService: KekRotationService) {}

  /**
   * Trigger an envelope-encryption key rotation for a tenant.
   *
   * This operation:
   *  • Decrypts each attachment's per-file DEK using the old KEK
   *  • Re-encrypts the same DEK under the new KEK
   *  • Updates only the DB row (encryptedDek, kekArn, kekVersion)
   *  • Never reads or writes file ciphertext in S3 / local storage
   *
   * The operation is idempotent – rows already on the target version are skipped.
   */
  @Post(':id/rotate-kek')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the KEK for a tenant (re-wrap all per-file DEKs)',
    description:
      'Re-wraps every attachment DEK under the new KEK without re-encrypting file data. ' +
      'Safe to retry; already-rotated rows are skipped.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiBody({ type: RotateKekDto, required: false })
  @ApiResponse({ status: 200, type: RotationResultDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 409,
    description: 'Rotation already in progress for this tenant',
  })
  async rotateTenantKek(
    @Param('id') tenantId: string,
    @Body() dto: RotateKekDto = {},
  ): Promise<RotationResultDto> {
    return this.rotationService.rotateTenantKek(
      tenantId,
      dto.newKekArn,
      dto.batchSize,
    );
  }

  /**
   * Return a breakdown of attachment counts per kek_version.
   * After a successful rotation every row should show the current kek_version.
   */
  @Get(':id/kek-status')
  @ApiOperation({ summary: 'Audit: attachment counts per kek_version' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  async getKekStatus(
    @Param('id') tenantId: string,
  ): Promise<{ kekVersion: string | null; count: number }[]> {
    return this.rotationService.getRotationStatus(tenantId);
  }
}