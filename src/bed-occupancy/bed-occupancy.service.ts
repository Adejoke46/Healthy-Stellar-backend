import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Bed } from './entities/bed.entity';
import { Room } from './entities/room.entity';
import { Ward } from './entities/ward.entity';
import { BedStatus } from './bed-status.enum';
import {
  AssignBedDto,
  BedOccupancyQueryDto,
  CreateBedDto,
  CreateRoomDto,
  CreateWardDto,
  UpdateBedStatusDto,
} from './dto/bed-occupancy.dto';

/** Lock-namespace prefix for transactional advisory locks. */
const ADVISORY_LOCK_NAMESPACE = 'bed_occupancy';

export const ALLOWED_BED_STATUS_TRANSITIONS: Record<BedStatus, BedStatus[]> = {
  [BedStatus.AVAILABLE]: [BedStatus.MAINTENANCE, BedStatus.CLEANING, BedStatus.RESERVED],
  [BedStatus.CLEANING]: [BedStatus.AVAILABLE, BedStatus.MAINTENANCE],
  [BedStatus.MAINTENANCE]: [BedStatus.AVAILABLE, BedStatus.CLEANING],
  [BedStatus.RESERVED]: [BedStatus.AVAILABLE, BedStatus.MAINTENANCE, BedStatus.CLEANING],
  [BedStatus.OCCUPIED]: [],
};

@Injectable()
export class BedOccupancyService {
  constructor(
    @InjectRepository(Bed) private readonly bedRepo: Repository<Bed>,
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    @InjectRepository(Ward) private readonly wardRepo: Repository<Ward>,
  ) {}

  // ── Wards ─────────────────────────────────────────────────────────────────

  async createWard(dto: CreateWardDto): Promise<Ward> {
    return this.wardRepo.save(this.wardRepo.create(dto));
  }

  async getWards(): Promise<Ward[]> {
    return this.wardRepo.find({ where: { isActive: true } });
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  async createRoom(dto: CreateRoomDto): Promise<Room> {
    await this.findWard(dto.wardId);
    return this.roomRepo.save(this.roomRepo.create(dto));
  }

  async getRoomsByWard(wardId: string): Promise<Room[]> {
    return this.roomRepo.find({ where: { wardId, isActive: true } });
  }

  // ── Beds ──────────────────────────────────────────────────────────────────

  async createBed(dto: CreateBedDto): Promise<Bed> {
    await this.findRoom(dto.roomId);
    return this.bedRepo.save(this.bedRepo.create(dto));
  }

  async getBeds(query: BedOccupancyQueryDto): Promise<Bed[]> {
    const where: Partial<Bed> = {};
    if (query.roomId) where.roomId = query.roomId;
    if (query.status) where.status = query.status;
    if (query.activeOnly !== false) where.isActive = true;
    return this.bedRepo.find({ where });
  }

  async getBedById(id: string): Promise<Bed> {
    const bed = await this.bedRepo.findOne({ where: { id } });
    if (!bed) throw new NotFoundException(`Bed ${id} not found`);
    return bed;
  }

  private async acquireBedLock(
    transactionalEntityManager: EntityManager,
    bedId: string,
  ): Promise<void> {
    const dbType = (transactionalEntityManager.connection.options as { type?: string }).type;
    if (dbType !== 'postgres') {
      // Other engines rely on database-level write locks
      return;
    }

    const lockKey = `${ADVISORY_LOCK_NAMESPACE}:bed:${bedId}`;
    const lockResult = (await transactionalEntityManager.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
      [lockKey],
    )) as Array<{ acquired?: boolean }>;

    const acquired = Array.isArray(lockResult) && lockResult[0]?.acquired === true;
    if (!acquired) {
      throw new ConflictException({
        message:
          'Another assignment is currently being processed for this bed. Please retry in a moment.',
        code: 'BED_ASSIGNMENT_LOCK_BUSY',
      });
    }
  }

  async assignBed(dto: AssignBedDto): Promise<Bed> {
    // Wrap in transaction with advisory locking to prevent concurrent double-booking
    return this.bedRepo.manager.transaction(
      async (transactionalEntityManager: EntityManager): Promise<Bed> => {
        // Acquire advisory lock to serialize concurrent assignments for this bed
        await this.acquireBedLock(transactionalEntityManager, dto.bedId);

        // Load bed within transaction with pessimistic lock
        const bed: Bed | null = await transactionalEntityManager
          .createQueryBuilder(Bed, 'bed')
          .useLock('pessimistic_write')
          .where('bed.id = :id', { id: dto.bedId })
          .getOne();

        if (!bed) {
          throw new NotFoundException(`Bed ${dto.bedId} not found`);
        }

        if (bed.status !== BedStatus.AVAILABLE) {
          throw new BadRequestException(`Bed ${dto.bedId} is not available`);
        }

        bed.patientId = dto.patientId;
        bed.status = BedStatus.OCCUPIED;
        bed.assignedAt = new Date();

        return transactionalEntityManager.save(Bed, bed);
      },
    );
  }

  async releaseBed(bedId: string): Promise<Bed> {
    const bed = await this.getBedById(bedId);
    if (bed.status !== BedStatus.OCCUPIED) {
      throw new BadRequestException(`Bed ${bedId} is not currently occupied`);
    }
    bed.patientId = null;
    bed.status = BedStatus.CLEANING;
    bed.assignedAt = null;
    return this.bedRepo.save(bed);
  }

  async updateBedStatus(bedId: string, dto: UpdateBedStatusDto): Promise<Bed> {
    return this.bedRepo.manager.transaction(
      async (transactionalEntityManager: EntityManager): Promise<Bed> => {
        await this.acquireBedLock(transactionalEntityManager, bedId);

        const bed: Bed | null = await transactionalEntityManager
          .createQueryBuilder(Bed, 'bed')
          .useLock('pessimistic_write')
          .where('bed.id = :id', { id: bedId })
          .getOne();

        if (!bed) {
          throw new NotFoundException(`Bed ${bedId} not found`);
        }

        if (dto.status === BedStatus.OCCUPIED) {
          throw new BadRequestException(
            'Cannot transition to OCCUPIED status via updateBedStatus; use assignBed instead',
          );
        }

        if (bed.status === BedStatus.OCCUPIED || bed.patientId) {
          throw new BadRequestException(
            `Bed ${bedId} is currently occupied and must be released via releaseBed`,
          );
        }

        const allowedTransitions = ALLOWED_BED_STATUS_TRANSITIONS[bed.status] || [];
        if (!allowedTransitions.includes(dto.status)) {
          throw new BadRequestException(
            `Invalid bed status transition from ${bed.status} to ${dto.status}`,
          );
        }

        bed.status = dto.status;
        return transactionalEntityManager.save(Bed, bed);
      },
    );
  }

  async getOccupancySummary(
    wardId?: string,
  ): Promise<Record<BedStatus, number> & { total: number }> {
    const qb = this.bedRepo
      .createQueryBuilder('bed')
      .select('bed.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('bed.isActive = true');

    if (wardId) {
      qb.innerJoin(Room, 'room', 'room.id = bed.roomId AND room.wardId = :wardId', { wardId });
    }

    const rows: Array<{ status: BedStatus; count: string }> = await qb
      .groupBy('bed.status')
      .getRawMany();

    const summary: Record<string, number> = { total: 0 };
    for (const { status, count } of rows) {
      summary[status] = Number(count);
      summary['total'] += Number(count);
    }
    return summary as Record<BedStatus, number> & { total: number };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findWard(id: string): Promise<Ward> {
    const ward = await this.wardRepo.findOne({ where: { id } });
    if (!ward) throw new NotFoundException(`Ward ${id} not found`);
    return ward;
  }

  private async findRoom(id: string): Promise<Room> {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException(`Room ${id} not found`);
    return room;
  }
}
