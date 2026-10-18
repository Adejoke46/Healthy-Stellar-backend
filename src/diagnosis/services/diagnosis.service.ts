import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between } from 'typeorm';
import { Diagnosis } from '../entities/diagnosis.entity';
import { DiagnosisHistory } from '../entities/diagnosis-history.entity';
import { CreateDiagnosisDto, UpdateDiagnosisDto, SearchDiagnosisDto } from '../dto/diagnosis.dto';
import { MedicalCodeService } from '../../billing/services/medical-code.service';
import { CodeType } from '../../common/enums';
import { TreatmentPlan } from '../../treatment-planning/entities/treatment-plan.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { DiagnosisStatus, DiagnosisSeverity } from '../../common/enums';

@Injectable()
export class DiagnosisService {
  constructor(
    @InjectRepository(Diagnosis)
    private readonly diagnosisRepository: Repository<Diagnosis>,
    @InjectRepository(DiagnosisHistory)
    private readonly diagnosisHistoryRepository: Repository<DiagnosisHistory>,
    @InjectRepository(TreatmentPlan)
    private readonly treatmentPlanRepository: Repository<TreatmentPlan>,
    private readonly medicalCodeService: MedicalCodeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createDiagnosisDto: CreateDiagnosisDto, userId: string): Promise<Diagnosis> {
    // Validate ICD-10 code exists and is active
    const icd10Code = await this.medicalCodeService.findById(createDiagnosisDto.icd10CodeId);

    if (!icd10Code) {
      throw new BadRequestException('Invalid ICD-10 code ID');
    }

    // Verify it's an ICD-10 code (CM or PCS)
    if (icd10Code.codeType !== CodeType.ICD10_CM && icd10Code.codeType !== CodeType.ICD10_PCS) {
      throw new BadRequestException('Code must be ICD-10-CM or ICD-10-PCS type');
    }

    if (!icd10Code.isActive) {
      throw new BadRequestException('ICD-10 code is not active');
    }

    const diagnosis = this.diagnosisRepository.create({ ...createDiagnosisDto, createdBy: userId });
    const saved = await this.diagnosisRepository.save(diagnosis);

    // Emit diagnosis creation notification
    this.notificationsService.emitDiagnosisCreated(
      userId,
      saved.id,
      {
        patientId: saved.patientId,
        providerId: saved.providerId,
        diagnosisCode: icd10Code.code,
        diagnosisDescription: icd10Code.description,
        severity: saved.severity,
        isPrimary: saved.isPrimary,
        treatmentPlanIds: [],
      },
    );

    return saved;
  }

  async findById(id: string): Promise<Diagnosis> {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      relations: ['icd10Code', 'history'],
    });

    if (!diagnosis) {
      throw new NotFoundException(`Diagnosis with ID ${id} not found`);
    }

    return diagnosis;
  }

  async findByPatientId(patientId: string): Promise<Diagnosis[]> {
    return await this.diagnosisRepository.find({
      where: { patientId },
      relations: ['icd10Code'],
      order: { diagnosisDate: 'DESC' },
    });
  }

  async update(id: string, updateDiagnosisDto: UpdateDiagnosisDto, userId: string): Promise<Diagnosis> {
    const diagnosis = await this.findById(id);

    // Track changes for history
    const changes: Record<string, any> = {};
    const previousValues: Record<string, any> = {};

    Object.keys(updateDiagnosisDto).forEach((key) => {
      if (key !== 'changeReason' && updateDiagnosisDto[key] !== undefined) {
        previousValues[key] = diagnosis[key];
        changes[key] = updateDiagnosisDto[key];
      }
    });

    // Create history entry if there are changes
    if (Object.keys(changes).length > 0) {
      const changeType = this.determineChangeType(changes);
      await this.createHistoryEntry(
        diagnosis.id,
        changeType,
        previousValues,
        changes,
        updateDiagnosisDto.changeReason,
        userId,
      );
    }

    // Update diagnosis
    Object.assign(diagnosis, updateDiagnosisDto);
    diagnosis.updatedBy = userId;
    const saved = await this.diagnosisRepository.save(diagnosis);

    // Emit notifications for escalations
    const treatmentPlans = await this.getTreatmentPlansForDiagnosis(diagnosis.id);
    const treatmentPlanIds = treatmentPlans.map(plan => plan.id);

    // Check for severity escalation
    if (changes.severity && previousValues.severity) {
      const previousSeverityLevel = this.getSeverityLevel(previousValues.severity);
      const newSeverityLevel = this.getSeverityLevel(changes.severity);
      if (newSeverityLevel > previousSeverityLevel) {
        this.notificationsService.emitDiagnosisSeverityEscalated(
          userId,
          diagnosis.id,
          {
            patientId: diagnosis.patientId,
            providerId: diagnosis.providerId,
            previousSeverity: previousValues.severity,
            newSeverity: changes.severity,
            treatmentPlanIds,
            reason: updateDiagnosisDto.changeReason,
          },
        );
      }
    }

    // Check for status confirmation
    if (changes.status === DiagnosisStatus.CONFIRMED && previousValues.status !== DiagnosisStatus.CONFIRMED) {
      this.notificationsService.emitDiagnosisStatusConfirmed(
        userId,
        diagnosis.id,
        {
          patientId: diagnosis.patientId,
          providerId: diagnosis.providerId,
          severity: diagnosis.severity,
          isPrimary: diagnosis.isPrimary,
          treatmentPlanIds,
          reason: updateDiagnosisDto.changeReason,
        },
      );
    }

    return saved;
  }

  async search(searchDto: SearchDiagnosisDto): Promise<Diagnosis[]> {
    const where: FindOptionsWhere<Diagnosis> = {};

    if (searchDto.patientId) {
      where.patientId = searchDto.patientId;
    }

    if (searchDto.providerId) {
      where.providerId = searchDto.providerId;
    }

    if (searchDto.status) {
      where.status = searchDto.status;
    }

    if (searchDto.severity) {
      where.severity = searchDto.severity;
    }

    if (searchDto.isChronic !== undefined) {
      where.isChronic = searchDto.isChronic;
    }

    if (searchDto.isPrimary !== undefined) {
      where.isPrimary = searchDto.isPrimary;
    }

    // Handle date range
    if (searchDto.diagnosisDateFrom && searchDto.diagnosisDateTo) {
      where.diagnosisDate = Between(
        new Date(searchDto.diagnosisDateFrom),
        new Date(searchDto.diagnosisDateTo),
      );
    }

    const queryBuilder = this.diagnosisRepository
      .createQueryBuilder('diagnosis')
      .leftJoinAndSelect('diagnosis.icd10Code', 'icd10Code')
      .where(where);

    // Handle ICD-10 code search
    if (searchDto.icd10Code) {
      queryBuilder.andWhere('icd10Code.code LIKE :code', {
        code: `%${searchDto.icd10Code}%`,
      });
    }

    return await queryBuilder.orderBy('diagnosis.diagnosisDate', 'DESC').getMany();
  }

  async delete(id: string): Promise<void> {
    const diagnosis = await this.findById(id);
    await this.diagnosisRepository.remove(diagnosis);
  }

  async getPatientActiveDiagnoses(patientId: string): Promise<Diagnosis[]> {
    return await this.diagnosisRepository.find({
      where: {
        patientId,
        status: 'confirmed' as any,
        resolvedDate: null as any,
      },
      relations: ['icd10Code'],
      order: { diagnosisDate: 'DESC' },
    });
  }

  async getPatientChronicConditions(patientId: string): Promise<Diagnosis[]> {
    return await this.diagnosisRepository.find({
      where: {
        patientId,
        isChronic: true,
      },
      relations: ['icd10Code'],
      order: { diagnosisDate: 'DESC' },
    });
  }

  async getDiagnosisHistory(diagnosisId: string): Promise<DiagnosisHistory[]> {
    return await this.diagnosisHistoryRepository.find({
      where: { diagnosisId },
      order: { createdAt: 'DESC' },
    });
  }

  async getTreatmentPlansForDiagnosis(diagnosisId: string): Promise<TreatmentPlan[]> {
    await this.findById(diagnosisId);
    return await this.treatmentPlanRepository
      .createQueryBuilder('plan')
      .where(":diagnosisId = ANY(string_to_array(plan.diagnosisIds, ','))", { diagnosisId })
      .orderBy('plan.createdAt', 'DESC')
      .getMany();
  }

  async getPatientDiagnosesWithTreatmentPlans(patientId: string): Promise<
    Array<{
      diagnosis: Diagnosis;
      treatmentPlans: TreatmentPlan[];
    }>
  > {
    const diagnoses = await this.findByPatientId(patientId);
    const results: Array<{ diagnosis: Diagnosis; treatmentPlans: TreatmentPlan[] }> = [];

    for (const diagnosis of diagnoses) {
      const plans = await this.getTreatmentPlansForDiagnosis(diagnosis.id);
      results.push({ diagnosis, treatmentPlans: plans });
    }

    return results;
  }

  private async createHistoryEntry(
    diagnosisId: string,
    changeType: string,
    previousValues: Record<string, any>,
    newValues: Record<string, any>,
    changeReason?: string,
    changedBy?: string,
  ): Promise<DiagnosisHistory> {
    const history = this.diagnosisHistoryRepository.create({
      diagnosisId,
      changeType,
      previousValues,
      newValues,
      changeReason,
      changedBy,
    });

    return await this.diagnosisHistoryRepository.save(history);
  }

  private determineChangeType(changes: Record<string, any>): string {
    if (changes.status) return 'status_change';
    if (changes.severity) return 'severity_change';
    if (changes.clinicalNotes) return 'notes_update';
    if (changes.icd10CodeId) return 'code_update';
    return 'general_update';
  }

  private getSeverityLevel(severity: DiagnosisSeverity | null | undefined): number {
    if (!severity) return 0;
    const levels: Record<string, number> = {
      [DiagnosisSeverity.MILD]: 1,
      [DiagnosisSeverity.MODERATE]: 2,
      [DiagnosisSeverity.SEVERE]: 3,
      [DiagnosisSeverity.CRITICAL]: 4,
    };
    return levels[severity] ?? 0;
  }
}
