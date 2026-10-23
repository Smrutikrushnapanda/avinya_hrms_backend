# Assign Work schema fix

## Confirmed cause

PostgreSQL returns `42703: column task.completed_point_indexes does not exist`.
Commit `0ed6ba2` added nullable `jsonb` checklist columns to both assignment entities without a corresponding migration. Production disables automatic schema synchronization, and EC2 deployment previously built and restarted PM2 without migrating.

Read-only inspection of configured database found:

| Table | Missing column | Required definition |
| --- | --- | --- |
| `public.project_tasks` | `completed_point_indexes` | `jsonb NULL`, no default |
| `public.project_issues` | `completed_point_indexes` | `jsonb NULL`, no default |

Every other `ProjectTask` column exists with matching PostgreSQL type and nullability, including `work_report text NULL`, `image_url text NULL`, and `completed_at timestamp without time zone NULL`. Task foreign keys match entity relations: assignee/assigner reference `users(user_id)` and project references `client_projects(id)` with `ON DELETE CASCADE`. Historical rows retain `NULL` checklist state, preserving legacy manual progress; new checklist assignments save `[]` explicitly.

No TypeORM `migrations` table exists in inspected schema. Existing `project_issues.project_id` is NOT NULL while entity permits NULL; older migration `1800000000000-MakeProjectIssueProjectIdNullable.ts` addresses this separately. It is not required for listing assignments and is not run by this fix.

## Migration scope

`AddAssignWorkCompletedPointIndexes1800000000001` adds only the two missing columns. Existing columns and records are preserved. Repeated execution is safe. Rollback refuses to drop persisted checklist data; roll back application code while retaining additive columns.

`npm run migrate:assign-work-checklist` uses existing `.env`/environment resolution, forces `synchronize: false`, disables extension installation, and registers only this migration. TypeORM records it in configured schema's migration history in a transaction. Older unrelated pending migrations are not executed or marked applied.

`npm run check:assign-work-schema` is read-only. It prints target database/schema, compares complete task entity column names/types/nullability, and checks internal assignment column presence and checklist definition. A mismatch exits nonzero. Both commands use `DATABASE_URL` preferentially; otherwise `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`; schema defaults to `public` or uses `DB_SCHEMA`.

## EC2 deployment plan

Production database has not been changed by this work. After approving this additive migration plan and deploying reviewed source to `~/avinya_hrms_backend`, run commands from that directory. Confirm server environment targets intended production database and schema; do not print credentials or tokens. Use normal database backup/restore process before approved deployment.

```bash
set -e
cd ~/avinya_hrms_backend
npm install
NODE_OPTIONS="--max-old-space-size=2048" npm run build
NODE_ENV=production DB_SYNCHRONIZE=false npm run migrate:assign-work-checklist
NODE_ENV=production DB_SYNCHRONIZE=false npm run check:assign-work-schema
NODE_ENV=production DB_SYNCHRONIZE=false pm2 restart backend --update-env
pm2 logs backend --lines 100 --nostream
```

Run sequentially and stop on any failed command. Migration output identifies database and schema. Schema verification must succeed before restart. Initial migration should report one migration applied; subsequent runs report zero. The GitHub Actions EC2 workflow now runs migration and verification between build and restart under its existing `set -e`.

Do not enable production synchronization or run all historical migrations as a workaround. Dockerfile starts compiled application without migrating; Docker deployments must run these same migration/check commands as a deployment step before replacing the running application.

## Endpoint verification after deployment

Sign in through existing application login flow with employee account. On Assign Work page, inspect Network responses for:

- `GET /assign-work/my`
- `GET /assign-work/assigned-by-me`
- `GET /assign-work/my?month=10&year=2026`
- `GET /assign-work/assigned-by-me?month=10&year=2026`

All must return HTTP 200 and assignment arrays (including `[]`). Verify assignee/assigner IDs belong to signed-in user, and compare known October first/last-day records. Queries use UTC start-inclusive, next-month-exclusive bounds, group tenant conditions, and filter employee scope in SQL. Missing/invalid authentication returns 401; invalid month/year returns 400. Check PM2 logs for new assignment query exceptions. Do not share bearer tokens in logs or reports.

Edit checklist points and work report on existing test assignment, refresh, complete it, and reopen it. Confirm persisted checklist indexes/report/image and completion timestamp behavior. These production checks remain pending until approved migration/deployment and authenticated replay.

## Regression verification

Database-backed suite uses a disposable local PostgreSQL schema and real Passport JWT validation with identity fixtures. It reproduces all four missing-column HTTP 500s, applies migration, checks filtered/unfiltered HTTP 200 arrays, validates empty results, invalid filters/authentication, tenant/employee isolation, legacy/null relationships, date boundaries for both sources, migration history/reruns/schema CLI, assignment creation, and progress/report/image/completion persistence. External notification dependencies are excluded.

```bash
ASSIGN_WORK_TEST_DATABASE_URL=postgresql://localhost:55439/postgres npm test -- --runInBand
npm run build
```

Test URL must point to isolated local PostgreSQL; tests create and remove only their own generated schema. They never use application's production database configuration for fixtures.

Verified locally: backend full suite **18 suites / 299 tests passed**, backend build passed, and lint passed for changed backend implementation/new test files. Frontend TypeScript check passed; avatar-file lint findings match committed baseline (17 errors, 21 warnings). Read-only preflight against configured `avinya_db.public` exits nonzero with exactly the two missing checklist columns, confirming production rollout remains necessary. No production migration, restart, or authenticated endpoint replay has been performed.
