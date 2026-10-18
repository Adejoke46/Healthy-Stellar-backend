import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Runbook, RunbookStatus } from '../entities/runbook.entity';
import {
  RunbookExecution,
  ExecutionStatus,
  StepExecutionResult,
} from '../entities/runbook-execution.entity';
import { RunbookMapping } from '../entities/runbook-mapping.entity';
import { IncidentType } from '../../healthcare-monitoring/entities/healthcare-incident.entity';
import {
  ApproveExecutionDto,
  CancelExecutionDto,
  CompleteExecutionDto,
  CreateRunbookDto,
  InitiateExecutionDto,
  RecordStepResultDto,
  RunbookQueryDto,
  UpdateRunbookDto,
} from '../dto/runbook.dto';
import { CreateRunbookMappingDto, UpdateRunbookMappingDto } from '../dto/runbook-mapping.dto';
import { AuditService } from '../../common/audit/audit.service';
import { AuditEventDto } from '../../common/audit/dto/audit-event.dto';

/** Extend AuditEventDto locally to carry runbook-specific metadata */
type RunbookAuditEvent = AuditEventDto & { metadata?: Record<string, any> };

export interface ResolvedRunbook {
  runbookId: string;
  runbookTitle: string;
  runbookUrl: string;
  steps: string[];
  isFallback: boolean;
}

const GENERIC_RUNBOOK: ResolvedRunbook = {
  runbookId: 'RUNBOOK-GENERIC',
  runbookTitle: 'General Incident Response Runbook',
  runbookUrl: 'https://docs.internal/runbooks/generic-incident-response',
  steps: [
    '1. Acknowledge the incident and assign an owner.',
    '2. Assess severity and impact scope.',
    '3. Notify relevant stakeholders and on-call team.',
    '4. Contain the issue to prevent further impact.',
    '5. Investigate root cause.',
    '6. Apply corrective actions and verify resolution.',
    '7. Document findings and close the incident.',
  ],
  isFallback: true,
};

@Injectable()
export class RunbookService {
  private readonly logger = new Logger(RunbookService.name);

  constructor(
    @InjectRepository(Runbook)
    private readonly runbookRepo: Repository<Runbook>,
    @InjectRepository(RunbookExecution)
    private readonly executionRepo: Repository<RunbookExecution>,
    @InjectRepository(RunbookMapping)
    private readonly runbookMappingRepo: Repository<RunbookMapping>,
    private readonly auditService: AuditService,
  ) {}

  // ─── Incident category → runbook mapping ──────────────────────────────────────

  async resolveForCategory(incidentCategory: IncidentType): Promise<ResolvedRunbook> {
    const mapping = await this.runbookMappingRepo.findOne({
      where: { incidentCategory, isActive: true },
    });

    if (!mapping) {
      this.logger.warn(
        `No runbook mapping found for category "${incidentCategory}", using generic fallback.`,
      );
      return GENERIC_RUNBOOK;
    }

    return {
      runbookId: mapping.runbookId,
      runbookTitle: mapping.runbookTitle,
      runbookUrl: mapping.runbookUrl,
      steps: mapping.steps ?? [],
      isFallback: false,
    };
  }

  async create(dto: CreateRunbookMappingDto): Promise<RunbookMapping> {
    const mapping = this.runbookMappingRepo.create(dto);
    return this.runbookMappingRepo.save(mapping);
  }

  async findAll(): Promise<RunbookMapping[]> {
    return this.runbookMappingRepo.find({ order: { incidentCategory: 'ASC' } });
  }

  async findOne(id: string): Promise<RunbookMapping> {
    const mapping = await this.runbookMappingRepo.findOne({ where: { id } });
    if (!mapping) throw new NotFoundException(`RunbookMapping ${id} not found`);
    return mapping;
  }

  async update(id: string, dto: UpdateRunbookMappingDto): Promise<RunbookMapping> {
    const mapping = await this.findOne(id);
    Object.assign(mapping, dto);
    return this.runbookMappingRepo.save(mapping);
  }

  async remove(id: string): Promise<void> {
    const mapping = await this.findOne(id);
    await this.runbookMappingRepo.remove(mapping);
  }

  // ─── Runbook CRUD ────────────────────────────────────────────────────────────

  async createRunbook(dto: CreateRunbookDto, operatorId: string): Promise<Runbook> {
    const runbook = this.runbookRepo.create({
      ...dto,
      createdBy: operatorId,
      status: RunbookStatus.DRAFT,
    });
    const saved = await this.runbookRepo.save(runbook);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_CREATED',
      resourceId: saved.id,
      resourceType: 'Runbook',
    });

    this.logger.log(`Runbook created: ${saved.id} by operator ${operatorId}`);
    return saved;
  }

  async listRunbooks(query: RunbookQueryDto): Promise<Runbook[]> {
    const where: Record<string, any> = {};
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.search) where.name = Like(`%${query.search}%`);

    return this.runbookRepo.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  async getRunbook(id: string): Promise<Runbook> {
    const runbook = await this.runbookRepo.findOne({ where: { id } });
    if (!runbook) throw new NotFoundException(`Runbook ${id} not found`);
    return runbook;
  }

  async updateRunbook(id: string, dto: UpdateRunbookDto, operatorId: string): Promise<Runbook> {
    const runbook = await this.getRunbook(id);

    if (runbook.status === RunbookStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update an archived runbook');
    }

    Object.assign(runbook, { ...dto, updatedBy: operatorId });
    const saved = await this.runbookRepo.save(runbook);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_UPDATED',
      resourceId: saved.id,
      resourceType: 'Runbook',
    });

    return saved;
  }

  async publishRunbook(id: string, operatorId: string): Promise<Runbook> {
    const runbook = await this.getRunbook(id);

    if (runbook.status !== RunbookStatus.DRAFT) {
      throw new BadRequestException(`Only draft runbooks can be published (current: ${runbook.status})`);
    }
    if (!runbook.steps?.length) {
      throw new BadRequestException('Runbook must have at least one step before publishing');
    }

    runbook.status = RunbookStatus.ACTIVE;
    runbook.updatedBy = operatorId;
    const saved = await this.runbookRepo.save(runbook);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_PUBLISHED',
      resourceId: saved.id,
      resourceType: 'Runbook',
    });

    return saved;
  }

  async deprecateRunbook(id: string, operatorId: string): Promise<Runbook> {
    const runbook = await this.getRunbook(id);
    runbook.status = RunbookStatus.DEPRECATED;
    runbook.updatedBy = operatorId;
    const saved = await this.runbookRepo.save(runbook);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_DEPRECATED',
      resourceId: saved.id,
      resourceType: 'Runbook',
    });

    return saved;
  }

  // ─── Execution lifecycle ─────────────────────────────────────────────────────

  async initiateExecution(
    runbookId: string,
    dto: InitiateExecutionDto,
    operatorId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<RunbookExecution> {
    const runbook = await this.getRunbook(runbookId);

    if (runbook.status !== RunbookStatus.ACTIVE) {
      throw new BadRequestException(`Runbook is not active (status: ${runbook.status})`);
    }

    const execution = this.executionRepo.create({
      runbookId,
      initiatedBy: operatorId,
      reason: dto.reason,
      context: dto.context,
      dryRun: dto.dryRun ?? false,
      notes: dto.notes,
      ipAddress,
      userAgent,
      status: runbook.requiresDualApproval
        ? ExecutionStatus.PENDING_APPROVAL
        : ExecutionStatus.APPROVED,
      // Self-approve if no dual approval required
      approvedBy: runbook.requiresDualApproval ? undefined : operatorId,
      approvedAt: runbook.requiresDualApproval ? undefined : new Date(),
    });

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_INITIATED',
      resourceId: saved.id,
      resourceType: 'RunbookExecution',
      metadata: { runbookId, dryRun: dto.dryRun, reason: dto.reason },
    } as RunbookAuditEvent);

    this.logger.log(
      `Execution ${saved.id} initiated for runbook ${runbookId} by ${operatorId} (dryRun=${dto.dryRun})`,
    );
    return saved;
  }

  async approveExecution(
    executionId: string,
    dto: ApproveExecutionDto,
    approverId: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    if (execution.status !== ExecutionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Execution is not pending approval (status: ${execution.status})`);
    }
    if (!approverId) {
      throw new ForbiddenException('Approver identity is required');
    }
    if (execution.initiatedBy === approverId) {
      throw new ForbiddenException('Initiator cannot approve their own execution request');
    }

    const runbook = await this.getRunbook(execution.runbookId);

    // Handle dual approval: first approval sets approvedBy, second sets secondApprovalBy
    if (!execution.approvedBy) {
      execution.approvedBy = approverId;
      execution.approvedAt = new Date();

      // If dual approval required, check if we need a second approver
      if (runbook.requiresDualApproval) {
        execution.status = ExecutionStatus.PENDING_APPROVAL; // still needs second
      } else {
        execution.status = ExecutionStatus.APPROVED;
      }
    } else if (runbook.requiresDualApproval && !execution.secondApprovalBy) {
      if (execution.approvedBy === approverId) {
        throw new ForbiddenException('Same operator cannot provide both approvals');
      }
      execution.secondApprovalBy = approverId;
      execution.status = ExecutionStatus.APPROVED;
    } else {
      throw new BadRequestException('Execution already has all required approvals');
    }

    if (dto.notes) execution.notes = execution.notes ? `${execution.notes}\n${dto.notes}` : dto.notes;

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: approverId,
      action: 'RUNBOOK_EXECUTION_APPROVED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
    });

    return saved;
  }

  async startExecution(executionId: string, operatorId: string): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    if (execution.status !== ExecutionStatus.APPROVED) {
      throw new BadRequestException(`Execution must be approved before starting (status: ${execution.status})`);
    }

    execution.status = ExecutionStatus.IN_PROGRESS;
    execution.executedBy = operatorId;
    execution.startedAt = new Date();
    execution.stepResults = [];

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_STARTED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
    });

    this.logger.log(`Execution ${executionId} started by ${operatorId}`);
    return saved;
  }

  async recordStepResult(
    executionId: string,
    dto: RecordStepResultDto,
    operatorId: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    if (execution.status !== ExecutionStatus.IN_PROGRESS) {
      throw new BadRequestException(`Execution is not in progress (status: ${execution.status})`);
    }

    const runbook = await this.getRunbook(execution.runbookId);
    const step = runbook.steps.find((s) => s.stepNumber === dto.stepNumber);
    if (!step) {
      throw new NotFoundException(`Step ${dto.stepNumber} not found in runbook`);
    }

    const result: StepExecutionResult = {
      stepNumber: dto.stepNumber,
      status: dto.status,
      output: dto.output,
      error: dto.error,
      startedAt: new Date(),
      completedAt: new Date(),
      executedBy: operatorId,
    };

    execution.stepResults = [...(execution.stepResults ?? []), result];
    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_STEP_RECORDED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
      metadata: { stepNumber: dto.stepNumber, status: dto.status },
    } as RunbookAuditEvent);

    return saved;
  }

  async completeExecution(
    executionId: string,
    dto: CompleteExecutionDto,
    operatorId: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    if (execution.status !== ExecutionStatus.IN_PROGRESS) {
      throw new BadRequestException(`Execution is not in progress (status: ${execution.status})`);
    }

    execution.status = ExecutionStatus.COMPLETED;
    execution.completedAt = new Date();
    if (dto.notes) execution.notes = execution.notes ? `${execution.notes}\n${dto.notes}` : dto.notes;

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_COMPLETED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
    });

    this.logger.log(`Execution ${executionId} completed by ${operatorId}`);
    return saved;
  }

  async failExecution(
    executionId: string,
    errorMessage: string,
    operatorId: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    if (execution.status !== ExecutionStatus.IN_PROGRESS) {
      throw new BadRequestException(`Execution is not in progress (status: ${execution.status})`);
    }

    execution.status = ExecutionStatus.FAILED;
    execution.errorMessage = errorMessage;
    execution.completedAt = new Date();

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_FAILED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
      metadata: { errorMessage },
    } as RunbookAuditEvent);

    this.logger.warn(`Execution ${executionId} failed: ${errorMessage}`);
    return saved;
  }

  async rollbackExecution(
    executionId: string,
    operatorId: string,
    notes?: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    const rollbackableStatuses = [ExecutionStatus.IN_PROGRESS, ExecutionStatus.FAILED, ExecutionStatus.COMPLETED];
    if (!rollbackableStatuses.includes(execution.status)) {
      throw new BadRequestException(`Cannot rollback execution in status: ${execution.status}`);
    }

    execution.status = ExecutionStatus.ROLLED_BACK;
    if (notes) execution.notes = execution.notes ? `${execution.notes}\nROLLBACK: ${notes}` : `ROLLBACK: ${notes}`;

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_ROLLED_BACK',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
      metadata: { notes },
    } as RunbookAuditEvent);

    this.logger.warn(`Execution ${executionId} rolled back by ${operatorId}`);
    return saved;
  }

  async cancelExecution(
    executionId: string,
    dto: CancelExecutionDto,
    operatorId: string,
  ): Promise<RunbookExecution> {
    const execution = await this.findExecution(executionId);

    const cancellableStatuses = [ExecutionStatus.PENDING_APPROVAL, ExecutionStatus.APPROVED];
    if (!cancellableStatuses.includes(execution.status)) {
      throw new BadRequestException(`Cannot cancel execution in status: ${execution.status}`);
    }

    execution.status = ExecutionStatus.CANCELLED;
    execution.notes = execution.notes
      ? `${execution.notes}\nCANCELLED: ${dto.reason}`
      : `CANCELLED: ${dto.reason}`;

    const saved = await this.executionRepo.save(execution);

    await this.auditService.log({
      actorId: operatorId,
      action: 'RUNBOOK_EXECUTION_CANCELLED',
      resourceId: executionId,
      resourceType: 'RunbookExecution',
      metadata: { reason: dto.reason },
    } as RunbookAuditEvent);

    return saved;
  }

  // ─── Query helpers ───────────────────────────────────────────────────────────

  async getExecutionHistory(
    runbookId: string,
    limit = 20,
  ): Promise<RunbookExecution[]> {
    await this.getRunbook(runbookId); // ensure runbook exists
    return this.executionRepo.find({
      where: { runbookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getExecution(executionId: string): Promise<RunbookExecution> {
    return this.findExecution(executionId);
  }

  async getActiveExecutions(): Promise<RunbookExecution[]> {
    return this.executionRepo.find({
      where: [
        { status: ExecutionStatus.PENDING_APPROVAL },
        { status: ExecutionStatus.APPROVED },
        { status: ExecutionStatus.IN_PROGRESS },
      ],
      relations: ['runbook'],
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async findExecution(id: string): Promise<RunbookExecution> {
    const execution = await this.executionRepo.findOne({ where: { id } });
    if (!execution) throw new NotFoundException(`Execution ${id} not found`);
    return execution;
  }
}
