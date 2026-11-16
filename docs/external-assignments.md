# External assignments and assignment editing

Regular assignments continue to use existing client tasks and internal issues. Existing create, personal lists, progress, deletion, notifications, project relationships, and checklist workflows remain in place.

External work uses `project_tasks` with three nullable columns: `external_assigner_name varchar(200)`, `assignment_date date`, and `assignment_remarks text`. All other fields reuse existing columns. No additional table or account is created. A non-null external assigner name identifies verbal work. Existing records remain regular with null external fields.

`assigned_by_user_id` retains authenticated recorder for audit and current participant permissions. The external person's name is independent of that user relationship. New external work is always assigned to authenticated recorder; create/edit forms omit Assigned To, and backend rejects attempts to assign external work to someone else or reassign it. Existing historical recipients remain unchanged. Regular employee selection and self-assignment restriction remain unchanged. External work is included in existing personal list APIs and visibly marked External / Verbal. Its assignment date determines month filtering; regular records retain creation-date filtering.

API additions are backward compatible:

- `POST /assign-work` accepts optional `assignmentKind: "external"`, required external person name and assignment date, and optional remarks/status. Existing regular payloads work unchanged.
- `PUT /assign-work/:id` edits details. `source: "internal"` targets existing internal issue; default targets client task. It preserves project and creator relationships. Checklist description edits match completed point text to new indexes rather than marking unrelated points complete. Legacy manual progress and work reports remain intact.
- Existing `PUT /assign-work/:id/progress` still manages status, checklist completion and work reports.
- Existing `DELETE /assign-work/:id?source=client|internal` is reused by confirmation dialog.
- `GET /assign-work` now enforces existing management roles server-side (`ADMIN`, `SUPER_ADMIN`, `ORG_ADMIN`, `MANAGER`, `HR`). It accepts `search`, `assignmentKind`, `status`, `priority`, `assignedToUserId`, and existing paired `month`/`year` filters. Tenant scope always comes from authenticated user.
- Options include authenticated user ID and management visibility flag. List results include edit/delete permissions using existing assignee, assigner, or management rules.

Shared frontend page provides employee-only External Assignment tab, record/edit composer, delete confirmation, external badges/remarks, and management search/filter controls. Existing Assigned to Me and Assigned by Me tabs retain their records and progress workflow.

Assignment schema is defined by existing TypeORM entities. Development uses configured entity synchronization. Backend build, tests and deployment have no migration-file dependency. Optional `npm run check:assign-work-schema` validates existing tables without changing schema or creating history. Existing production synchronization settings are unchanged.

The earlier missing external columns were repaired in configured database. Removing obsolete build dependencies does not alter records or database history. Regression tests use isolated local PostgreSQL and entity-defined schema.

Verified: 18 backend suites / 312 tests, backend/frontend production builds (99 frontend pages), and targeted backend/frontend lint. Frontend builds use isolated source copy because existing dev server shares original `.next` directory. Browser checks with mocked API responses passed: regular employee selector remains available, external create/edit omit Assigned To, external requests omit recipient fields, self-assigned work appears in personal tabs, and editing/delete confirmation/admin search/type filtering/clear still work.
