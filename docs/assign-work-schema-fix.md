# Assignment schema checks

Assignment entities are source of truth. Backend does not import or discover files from `src/migrations`, and deployment does not run a migration command. Removed schema runner had stale imports after that directory was deleted, causing TS2307 during compilation.

Existing development configuration uses TypeORM entity synchronization. Production synchronization remains controlled by existing environment configuration; this compilation fix does not enable it or modify database records.

`npm run check:assign-work-schema` is optional and read-only. It compares assignment table columns against entity metadata, including types, array flags, nullability and checklist defaults. It neither changes schema nor creates schema history.

```bash
npm run build
npm run check:assign-work-schema
```

Production logs on November 24, 2026 confirmed `column task.external_assigner_name does not exist`. Local schema checks do not verify the separate production database. Both personal lists select external assignment fields, so missing columns break regular assignments too.

From backend directory on production host, after deploying current source:

```bash
NODE_ENV=production DB_SYNCHRONIZE=false npm run repair:assign-work-schema
NODE_ENV=production DB_SYNCHRONIZE=false npm run check:assign-work-schema
```

Repair adds only missing `external_assigner_name`, `assignment_date` and `assignment_remarks` columns to configured schema's `project_tasks`, using entity types and nullability. Existing columns must match entity definitions. Changes run in one transaction with a five-second lock timeout. Repeated runs preserve existing columns and work records. Deployment runs this targeted repair before read-only verification and backend restart. Full schema synchronization stays disabled.

Checker also validates user and project tables selected by assignment joins.

Regression tests use disposable local PostgreSQL schemas and entity synchronization for initial setup. They verify authenticated personal lists, tenant and employee scope, dates, paragraph/checklist work across both sources, CRUD, permissions, external self-assignment and a read-only schema check. Missing-column fixtures are restored within the isolated test only.
