# Assignment schema checks

Assignment entities are source of truth. Backend does not import or discover files from `src/migrations`, and deployment does not run a migration command. Removed schema runner had stale imports after that directory was deleted, causing TS2307 during compilation.

Existing development configuration uses TypeORM entity synchronization. Production synchronization remains controlled by existing environment configuration; this compilation fix does not enable it or modify database records.

`npm run check:assign-work-schema` is optional and read-only. It compares assignment table columns against entity metadata, including types, array flags, nullability and checklist defaults. It neither changes schema nor creates schema history.

```bash
npm run build
npm run check:assign-work-schema
```

Configured assignment database already has nullable JSONB checklist state, nullable internal project ID and external assignment fields from earlier repairs. Existing data and history tables are retained. No database update is performed by the new checker.

Regression tests use disposable local PostgreSQL schemas and entity synchronization for initial setup. They verify authenticated personal lists, tenant and employee scope, dates, paragraph/checklist work across both sources, CRUD, permissions, external self-assignment and a read-only schema check. Missing-column fixtures are restored within the isolated test only.
