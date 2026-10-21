import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegisteredByToPatients1794000000000 implements MigrationInterface {
  name = 'AddRegisteredByToPatients1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "registeredBy" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN IF EXISTS "registeredBy"`);
  }
}
