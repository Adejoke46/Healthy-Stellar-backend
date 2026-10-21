import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdministrationStatus,
  MedicationAdministrationRecord,
} from '../entities/medication-administration-record.entity';
import { MissedDoseService } from '../services/missed-dose.service';
import { MissedDoseDetectionTask } from './missed-dose-detection.task';

describe('MissedDoseDetectionTask', () => {
  let task: MissedDoseDetectionTask;
  let marRepository: {
    find: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let missedDoseService: { createMissedDoseWithManager: jest.Mock };
  let updateQueryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
  };
  let transactionManager: { createQueryBuilder: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    updateQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [] }),
    };
    transactionManager = {
      createQueryBuilder: jest.fn().mockReturnValue(updateQueryBuilder),
      findOne: jest.fn(),
    };
    marRepository = {
      find: jest.fn(),
      manager: {
        transaction: jest.fn((callback) => callback(transactionManager)),
      },
    };
    missedDoseService = { createMissedDoseWithManager: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissedDoseDetectionTask,
        { provide: getRepositoryToken(MedicationAdministrationRecord), useValue: marRepository },
        { provide: MissedDoseService, useValue: missedDoseService },
      ],
    }).compile();

    task = module.get(MissedDoseDetectionTask);
  });

  it('does not create a missed-dose record if administration won the conditional update race', async () => {
    marRepository.find.mockResolvedValue([{ id: 'mar-1' }]);

    await task.detectMissedDoses();

    expect(marRepository.find).toHaveBeenCalledWith({
      where: {
        status: AdministrationStatus.SCHEDULED,
        scheduledTime: expect.anything(),
      },
    });
    expect(updateQueryBuilder.update).toHaveBeenCalledWith(MedicationAdministrationRecord);
    expect(updateQueryBuilder.set).toHaveBeenCalledWith({
      status: AdministrationStatus.MISSED,
    });
    expect(updateQueryBuilder.where).toHaveBeenCalledWith(
      'id = :id AND status = :scheduled AND scheduled_time <= :graceCutoff',
      expect.objectContaining({
        id: 'mar-1',
        scheduled: AdministrationStatus.SCHEDULED,
      }),
    );
    expect(updateQueryBuilder.returning).toHaveBeenCalledWith('*');
    expect(missedDoseService.createMissedDoseWithManager).not.toHaveBeenCalled();
    expect(transactionManager.findOne).not.toHaveBeenCalled();
  });

  it('creates one missed-dose record only after a successful conditional transition', async () => {
    const transitionedMar = {
      id: 'mar-1',
      status: AdministrationStatus.MISSED,
    } as MedicationAdministrationRecord;
    marRepository.find.mockResolvedValue([{ id: 'mar-1' }]);
    updateQueryBuilder.execute.mockResolvedValue({ raw: [{ id: 'mar-1' }] });
    transactionManager.findOne.mockResolvedValue(transitionedMar);

    await task.detectMissedDoses();

    expect(missedDoseService.createMissedDoseWithManager).toHaveBeenCalledWith(
      transactionManager,
      transitionedMar,
      'system',
      'Automated grace-period detection',
    );
  });
});
