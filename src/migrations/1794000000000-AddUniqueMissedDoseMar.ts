import { MigrationInterface, QueryRunner } from 'typeorm';
import { createIndexConcurrently } from '../common/utils/migration-safety.util';

export class AddUniqueMissedDoseMar1794000000000 implements MigrationInterface {
  name = 'AddUniqueMissedDoseMar1794000000';

  private readonly indexName = 'UQ_missed_doses_mar_id';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('missed_doses'))) {
      return;
    }

    const duplicates: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS count FROM (
         SELECT "mar_id"
         FROM "missed_doses"
         GROUP BY "mar_id"
         HAVING COUNT(*) > 1
       ) duplicates`,
    );
    if (Number(duplicates[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot add unique missed-dose MAR constraint: duplicate mar_id values exist in missed_doses',
      );
    }

    await createIndexConcurrently(
      queryRunner,
      this.indexName,
      'missed_doses',
      ['mar_id'],
      true,
    );
    if (!(await queryRunner.hasIndex('missed_doses', this.indexName))) {
      throw new Error(`Failed to create unique index ${this.indexName}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('missed_doses')) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${this.indexName}"`);
    }
  }
}
