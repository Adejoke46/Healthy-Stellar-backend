import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand migration: add tenantId to report_schedules so admin CRUD can be
 * scoped to the caller's tenant. Nullable so existing rows remain valid;
 * legacy rows without a tenant are not visible to any tenant's admins.
 */
export class AddTenantIdToReportSchedules1793000000000 implements MigrationInterface {
  name = 'AddTenantIdToReportSchedules1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('report_schedules'))) return;

    await queryRunner.query(`
      ALTER TABLE "report_schedules"
        ADD COLUMN IF NOT EXISTS "tenantId" character varying
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_report_schedules_tenantId"
        ON "report_schedules" ("tenantId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('report_schedules'))) return;

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_report_schedules_tenantId"`);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
        DROP COLUMN IF EXISTS "tenantId"
    `);
  }
}
