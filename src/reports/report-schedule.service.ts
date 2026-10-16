import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { ReportSchedule, ReportFrequency } from './entities/report-schedule.entity';
import { ReportFormat } from './entities/report-job.entity';
import { ReportsService } from './reports.service';
import { CreateReportScheduleDto, UpdateReportScheduleDto } from './dto/report-schedule.dto';

@Injectable()
export class ReportScheduleService {
  private readonly logger = new Logger(ReportScheduleService.name);

  constructor(
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepo: Repository<ReportSchedule>,
    private readonly reportsService: ReportsService,
  ) {}

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async create(dto: CreateReportScheduleDto, tenantId: string): Promise<ReportSchedule> {
    const schedule = this.scheduleRepo.create({
      ...dto,
      tenantId,
      format: dto.format ?? ReportFormat.PDF,
      dayOfWeek: dto.dayOfWeek ?? null,
      dayOfMonth: dto.dayOfMonth ?? null,
      isActive: true,
      unsubscribeToken: uuidv4(),
    });
    return this.scheduleRepo.save(schedule);
  }

  async findAll(tenantId: string): Promise<ReportSchedule[]> {
    return this.scheduleRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, tenantId: string): Promise<ReportSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id, tenantId } });
    if (!schedule) throw new NotFoundException(`ReportSchedule ${id} not found`);
    return schedule;
  }

  async update(id: string, dto: UpdateReportScheduleDto, tenantId: string): Promise<ReportSchedule> {
    const schedule = await this.findOne(id, tenantId);
    Object.assign(schedule, dto);
    return this.scheduleRepo.save(schedule);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const schedule = await this.findOne(id, tenantId);
    await this.scheduleRepo.remove(schedule);
  }

  /** Recipient clicks the one-click unsubscribe link in any delivered email. */
  async unsubscribe(token: string, email: string): Promise<{ message: string }> {
    const schedule = await this.scheduleRepo.findOne({ where: { unsubscribeToken: token } });
    if (!schedule) throw new NotFoundException('Invalid unsubscribe token');

    schedule.recipients = schedule.recipients.filter((r) => r !== email);
    if (schedule.recipients.length === 0) {
      schedule.isActive = false;
    }
    await this.scheduleRepo.save(schedule);
    return { message: `${email} removed from schedule ${schedule.id}` };
  }

  // ── Cron jobs ──────────────────────────────────────────────────────────────

  /** Runs every day at 06:00 UTC — evaluates daily, weekly, and monthly schedules. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async evaluateSchedules(): Promise<void> {
    const now = new Date();
    const dow = now.getDay();   // 0=Sun … 6=Sat
    const dom = now.getDate();  // 1–31

    const activeSchedules = await this.scheduleRepo.find({ where: { isActive: true } });

    for (const schedule of activeSchedules) {
      if (!this.isDue(schedule, dow, dom)) continue;

      this.logger.log(
        `Dispatching scheduled report: scheduleId=${schedule.id} type=${schedule.reportType} recipients=${schedule.recipients.length}`,
      );

      for (const recipientEmail of schedule.recipients) {
        await this.reportsService
          .requestReport(schedule.patientId, schedule.format, schedule.tenantId, recipientEmail)
          .catch((err) => {
            this.logger.error(
              `Failed to dispatch report for schedule ${schedule.id} to ${recipientEmail}`,
              err.stack,
            );
          });
      }
    }
  }

  // ── Helpers (also used by tests) ──────────────────────────────────────────

  isDue(schedule: ReportSchedule, currentDow: number, currentDom: number): boolean {
    switch (schedule.frequency) {
      case ReportFrequency.DAILY:
        return true;
      case ReportFrequency.WEEKLY:
        return schedule.dayOfWeek === currentDow;
      case ReportFrequency.MONTHLY:
        return schedule.dayOfMonth === currentDom;
      default:
        return false;
    }
  }
}
