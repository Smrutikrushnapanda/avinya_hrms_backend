import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPolymorphicEmployeeProjectAssignmentProjectForeignKeys1791500000000
  implements MigrationInterface
{
  name =
    'DropPolymorphicEmployeeProjectAssignmentProjectForeignKeys1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_record record;
      BEGIN
        FOR constraint_record IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class child ON child.oid = con.conrelid
          JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
          JOIN pg_class parent ON parent.oid = con.confrelid
          JOIN pg_attribute attr
            ON attr.attrelid = child.oid
           AND attr.attnum = ANY(con.conkey)
          WHERE con.contype = 'f'
            AND child.relname = 'employee_project_assignments'
            AND child_ns.nspname = current_schema()
            AND attr.attname = 'project_id'
            AND parent.relname IN ('projects', 'client_projects')
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
            current_schema(),
            'employee_project_assignments',
            constraint_record.conname
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Cannot safely restore one FK for a polymorphic project_id column.
  }
}
