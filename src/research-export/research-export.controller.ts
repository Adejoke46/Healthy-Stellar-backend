import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_BEARER_AUTH_SCHEME } from '../common/constants/swagger.constants';
import { Response } from 'express';
import { CurrentMedicalUser, RequirePermissions } from '../roles/medical-rbac.decorator';
import { MedicalPermission } from '../roles/medical-roles.enum';
import { MedicalRbacGuard } from '../roles/medical-rbac.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MedicalUser } from '../interfaces/medical-rbac.interface';
import { AuditService } from '../common/audit/audit.service';
import { ResearchExportService } from './research-export.service';
import { ResearchAnonymizerService } from './research-anonymizer.service';
import { AnonymizedExportFilterDto } from './dto/research-export.dto';

@ApiTags('Research Export')
@Controller('research-export')
@UseGuards(JwtAuthGuard, MedicalRbacGuard)
export class ResearchExportController {
  constructor(
    private readonly researchExportService: ResearchExportService,
    private readonly anonymizer: ResearchAnonymizerService,
    private readonly auditService: AuditService,
  ) {}

  @Post('anonymized')
  @RequirePermissions(MedicalPermission.RESEARCH_EXPORT)
  @ApiBearerAuth(API_BEARER_AUTH_SCHEME)
  @ApiOperation({
    summary: 'Stream a k-anonymized research dataset as NDJSON',
    description:
      'Strips all direct and quasi-identifiers from the matching medical records and streams ' +
      'one de-identified JSON record per line (application/x-ndjson). Quasi-identifier groups ' +
      '(age range + region + record type + year) smaller than k=5 are suppressed. If suppression ' +
      'would leave zero exportable records, the request fails rather than returning unsafe partial data.',
  })
  @ApiResponse({ status: 200, description: 'NDJSON stream of anonymized records' })
  @ApiResponse({ status: 403, description: 'Missing RESEARCH_EXPORT permission' })
  @ApiResponse({
    status: 422,
    description: 'k-anonymity constraint (k>=5) could not be satisfied for this filter',
  })
  async streamAnonymizedExport(
    @Body() filters: AnonymizedExportFilterDto,
    @CurrentMedicalUser() user: MedicalUser,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    // Audit the request itself (requesting user + filter applied) before any
    // data is touched, so a denial of service due to k-anonymity failure is
    // still recorded.
    await this.auditService.logDataExport(
      user.id,
      'AnonymizedResearchExportStream',
      [],
      req.ip ?? 'unknown',
      req.get?.('User-Agent') ?? 'ResearchExportController',
      { filters, endpoint: 'POST /research-export/anonymized' },
    );

    const { records, patientMap } = await this.researchExportService.fetchRecordsAndPatients(
      filters,
    );

    const anonymizedRows = records.map((record) =>
      this.anonymizer.anonymizeRecord(record, patientMap.get(record.patientId)),
    );

    // Throws UnprocessableEntityException if k-anonymity (k>=5) cannot be
    // satisfied — propagates as a normal Nest exception response since no
    // stream bytes have been written yet.
    const safeRows = this.anonymizer.enforceKAnonymity(anonymizedRows);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');

    for (const row of safeRows) {
      res.write(`${JSON.stringify(row)}\n`);
    }

    res.end();
  }
}
