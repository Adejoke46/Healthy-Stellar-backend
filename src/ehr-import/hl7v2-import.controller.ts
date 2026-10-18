import { Body, Controller, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Hl7v2LabImportService } from './services/hl7v2-lab-import.service';
import { ImportHl7v2Dto } from './dto/import-hl7v2.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/audit-context.decorator';
import { UserRole } from '../auth/entities/user.entity';

/**
 * HL7 v2 Import Controller
 * CRITICAL: All endpoints require authentication (JWT with appropriate role).
 * Prevents unauthorized fabrication of medical lab results.
 */
@ApiTags('EHR Import')
@Controller('ehr-import')
export class Hl7v2ImportController {
  constructor(private readonly hl7v2LabImportService: Hl7v2LabImportService) {}

  /**
   * POST /ehr-import/hl7v2
   * Requires authentication via Bearer JWT token with hl7_import or clinical roles.
   *
   * CRITICAL SECURITY:
   * - Unauthenticated callers cannot fabricate lab results
   * - Lab results are persisted to actual patient records
   * - No fallback to anonymous/public access
   * - Only authorized healthcare staff can import
   */
  @Post('hl7v2')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Import lab results from a raw HL7 v2 ORU^R01 message',
    description:
      'Accepts a raw, pipe-delimited HL7 v2 ORU^R01 message (segments separated by CR/LF), ' +
      'validates MSH/PID/OBR/OBX segments, maps OBX-3 LOINC codes to internal test codes, ' +
      'and persists the results as LabResult rows. Requires authentication as admin, physician, or nurse.',
  })
  @ApiBody({ type: ImportHl7v2Dto })
  @ApiResponse({ status: 201, description: 'Lab results imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid HL7 message format or validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - no valid authentication provided' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions for HL7 import' })
  async importHl7v2(@Body() dto: ImportHl7v2Dto, @CurrentUser() user: any) {
    // Verify user has appropriate role (defense in depth)
    const allowedRoles = [UserRole.ADMIN, UserRole.PHYSICIAN, UserRole.NURSE];
    if (!user || !allowedRoles.includes(user.role)) {
      throw new ForbiddenException('User does not have permission to import lab results');
    }

    const { created } = await this.hl7v2LabImportService.importRaw(dto.message);
    return {
      imported: created.length,
      results: created.map((r) => ({ id: r.id, orderId: r.orderId, testCode: r.testCode })),
    };
  }
}
