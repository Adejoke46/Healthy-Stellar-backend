import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ALLOWED_BED_STATUS_TRANSITIONS, BedOccupancyService } from './bed-occupancy.service';
import { Bed } from './entities/bed.entity';
import { Room } from './entities/room.entity';
import { Ward } from './entities/ward.entity';
import { BedStatus } from './bed-status.enum';

const makeWard = (o: Partial<Ward> = {}): Ward =>
  ({ id: 'w1', name: 'Ward A', isActive: true, wardManagerId: null, ...o }) as Ward;

const makeRoom = (o: Partial<Room> = {}): Room =>
  ({ id: 'r1', wardId: 'w1', roomNumber: '101', isActive: true, ...o }) as Room;

const makeBed = (o: Partial<Bed> = {}): Bed =>
  ({
    id: 'b1',
    bedNumber: '1A',
    status: BedStatus.AVAILABLE,
    roomId: 'r1',
    patientId: null,
    assignedAt: null,
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  }) as Bed;

interface BuildModuleOptions {
  dbType?: string;
  lockAcquired?: boolean;
}

function buildModule(
  bedRecord: Bed | null = makeBed(),
  roomRecord: Room | null = makeRoom(),
  wardRecord: Ward | null = makeWard(),
  options: BuildModuleOptions = {},
) {
  let currentBed = bedRecord ? { ...bedRecord } : null;

  const queryBuilder = {
    useLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockImplementation(async () => (currentBed ? { ...currentBed } : null)),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([
      { status: BedStatus.AVAILABLE, count: '5' },
      { status: BedStatus.OCCUPIED, count: '3' },
    ]),
  };

  const mockEntityManager = {
    connection: {
      options: { type: options.dbType ?? 'better-sqlite3' },
    },
    query: jest.fn().mockImplementation(async () => [{ acquired: options.lockAcquired ?? true }]),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    save: jest.fn().mockImplementation(async (_targetOrEntity: any, entity?: any) => {
      const saved = entity !== undefined ? entity : _targetOrEntity;
      currentBed = { ...saved };
      return saved;
    }),
  };

  const bedRepo = {
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation(async (r) => {
      currentBed = { ...r };
      return r;
    }),
    find: jest.fn().mockImplementation(async () => (currentBed ? [{ ...currentBed }] : [])),
    findOne: jest.fn().mockImplementation(async () => (currentBed ? { ...currentBed } : null)),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockEntityManager)),
    },
  };

  const roomRepo = {
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation(async (r) => r),
    find: jest.fn().mockResolvedValue(roomRecord ? [roomRecord] : []),
    findOne: jest.fn().mockResolvedValue(roomRecord),
  };

  const wardRepo = {
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation(async (r) => r),
    find: jest.fn().mockResolvedValue(wardRecord ? [wardRecord] : []),
    findOne: jest.fn().mockResolvedValue(wardRecord),
  };

  return {
    compile: () =>
      Test.createTestingModule({
        providers: [
          BedOccupancyService,
          { provide: getRepositoryToken(Bed), useValue: bedRepo },
          { provide: getRepositoryToken(Room), useValue: roomRepo },
          { provide: getRepositoryToken(Ward), useValue: wardRepo },
        ],
      }).compile(),
    mockEntityManager,
    bedRepo,
  };
}

describe('BedOccupancyService', () => {
  describe('createWard', () => {
    it('creates and returns a ward', async () => {
      const { compile } = buildModule();
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.createWard({ name: 'Ward A' });
      expect(result).toMatchObject({ name: 'Ward A' });
    });
  });

  describe('createRoom', () => {
    it('throws NotFoundException when ward not found', async () => {
      const { compile } = buildModule(makeBed(), makeRoom(), null);
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.createRoom({ wardId: 'w1', roomNumber: '101' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a room when ward exists', async () => {
      const { compile } = buildModule();
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.createRoom({ wardId: 'w1', roomNumber: '101' });
      expect(result).toMatchObject({ wardId: 'w1', roomNumber: '101' });
    });
  });

  describe('createBed', () => {
    it('throws NotFoundException when room not found', async () => {
      const { compile } = buildModule(makeBed(), null);
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.createBed({ bedNumber: '1A', roomId: 'r1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a bed when room exists', async () => {
      const { compile } = buildModule();
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.createBed({ bedNumber: '1A', roomId: 'r1' });
      expect(result).toMatchObject({ bedNumber: '1A', roomId: 'r1' });
    });
  });

  describe('assignBed', () => {
    it('assigns an available bed to a patient', async () => {
      const { compile } = buildModule();
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.assignBed({ bedId: 'b1', patientId: 'p1' });
      expect(result.status).toBe(BedStatus.OCCUPIED);
      expect(result.patientId).toBe('p1');
    });

    it('throws BadRequestException when bed is not available', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.OCCUPIED }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.assignBed({ bedId: 'b1', patientId: 'p1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when bed not found', async () => {
      const { compile } = buildModule(null);
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.assignBed({ bedId: 'b1', patientId: 'p1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when bed advisory lock is busy in postgres', async () => {
      const { compile } = buildModule(makeBed(), makeRoom(), makeWard(), {
        dbType: 'postgres',
        lockAcquired: false,
      });
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.assignBed({ bedId: 'b1', patientId: 'p1' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('releaseBed', () => {
    it('releases an occupied bed to cleaning status', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.OCCUPIED, patientId: 'p1' }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.releaseBed('b1');
      expect(result.status).toBe(BedStatus.CLEANING);
      expect(result.patientId).toBeNull();
    });

    it('throws BadRequestException when bed is not occupied', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.releaseBed('b1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateBedStatus', () => {
    it('throws NotFoundException when bed not found', async () => {
      const { compile } = buildModule(null);
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.MAINTENANCE })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects moving bed to OCCUPIED status', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.OCCUPIED })).rejects.toThrow(
        new BadRequestException(
          'Cannot transition to OCCUPIED status via updateBedStatus; use assignBed instead',
        ),
      );
    });

    it('rejects status update when bed is currently OCCUPIED', async () => {
      const { compile } = buildModule(
        makeBed({ status: BedStatus.OCCUPIED, patientId: 'patient-1' }),
      );
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE })).rejects.toThrow(
        new BadRequestException('Bed b1 is currently occupied and must be released via releaseBed'),
      );
    });

    it('rejects status update when bed has a patient assigned', async () => {
      const { compile } = buildModule(
        makeBed({ status: BedStatus.CLEANING, patientId: 'patient-1' }),
      );
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE })).rejects.toThrow(
        new BadRequestException('Bed b1 is currently occupied and must be released via releaseBed'),
      );
    });

    it('allows valid transition: AVAILABLE -> MAINTENANCE', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.MAINTENANCE });
      expect(result.status).toBe(BedStatus.MAINTENANCE);
    });

    it('allows valid transition: AVAILABLE -> CLEANING', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.CLEANING });
      expect(result.status).toBe(BedStatus.CLEANING);
    });

    it('allows valid transition: AVAILABLE -> RESERVED', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.RESERVED });
      expect(result.status).toBe(BedStatus.RESERVED);
    });

    it('allows valid transition: CLEANING -> AVAILABLE', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.CLEANING }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE });
      expect(result.status).toBe(BedStatus.AVAILABLE);
    });

    it('allows valid transition: CLEANING -> MAINTENANCE', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.CLEANING }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.MAINTENANCE });
      expect(result.status).toBe(BedStatus.MAINTENANCE);
    });

    it('allows valid transition: MAINTENANCE -> AVAILABLE', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.MAINTENANCE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE });
      expect(result.status).toBe(BedStatus.AVAILABLE);
    });

    it('allows valid transition: MAINTENANCE -> CLEANING', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.MAINTENANCE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.CLEANING });
      expect(result.status).toBe(BedStatus.CLEANING);
    });

    it('allows valid transition: RESERVED -> AVAILABLE', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.RESERVED }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE });
      expect(result.status).toBe(BedStatus.AVAILABLE);
    });

    it('rejects invalid transition: CLEANING -> RESERVED', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.CLEANING }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.RESERVED })).rejects.toThrow(
        new BadRequestException('Invalid bed status transition from cleaning to reserved'),
      );
    });

    it('rejects invalid transition: MAINTENANCE -> RESERVED', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.MAINTENANCE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.RESERVED })).rejects.toThrow(
        new BadRequestException('Invalid bed status transition from maintenance to reserved'),
      );
    });

    it('rejects self-transition (e.g. AVAILABLE -> AVAILABLE)', async () => {
      const { compile } = buildModule(makeBed({ status: BedStatus.AVAILABLE }));
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.AVAILABLE })).rejects.toThrow(
        new BadRequestException('Invalid bed status transition from available to available'),
      );
    });

    it('takes the same advisory lock as assignBed and throws ConflictException when lock is busy', async () => {
      const { compile } = buildModule(makeBed(), makeRoom(), makeWard(), {
        dbType: 'postgres',
        lockAcquired: false,
      });
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      await expect(svc.updateBedStatus('b1', { status: BedStatus.MAINTENANCE })).rejects.toThrow(
        ConflictException,
      );
    });

    it('takes advisory lock and executes transactional update when lock is free in postgres', async () => {
      const { compile, mockEntityManager } = buildModule(makeBed(), makeRoom(), makeWard(), {
        dbType: 'postgres',
        lockAcquired: true,
      });
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const result = await svc.updateBedStatus('b1', { status: BedStatus.MAINTENANCE });

      expect(mockEntityManager.query).toHaveBeenCalledWith(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
        ['bed_occupancy:bed:b1'],
      );
      expect(result.status).toBe(BedStatus.MAINTENANCE);
    });
  });

  describe('getOccupancySummary', () => {
    it('returns status counts and total', async () => {
      const { compile } = buildModule();
      const mod = await compile();
      const svc = mod.get(BedOccupancyService);
      const summary = await svc.getOccupancySummary();
      expect(summary[BedStatus.AVAILABLE]).toBe(5);
      expect(summary[BedStatus.OCCUPIED]).toBe(3);
      expect(summary.total).toBe(8);
    });
  });
});
