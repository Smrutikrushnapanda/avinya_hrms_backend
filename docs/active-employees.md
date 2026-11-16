# Active employee lists

Working employee directories and selectors require both `employees.status = 'active'` and `users.is_active = true`. This also excludes historical records whose employment and login flags disagree, without modifying those records.

Employee list endpoints treat omitted status, `active`, and `all` as active-only. Explicit Inactive management view remains available for reactivation and includes active employment records with disabled logins. Other explicit employment statuses remain available for administration. Historical attendance, assignments, payslips and project relationships are preserved.

Shared criteria apply to employee directories, paginated management lists, employee selectors, search suggestions, manager choices, organization hierarchy, birthday/recent-joiner lists, assignment recipient options/validation, performance working lists, poll nonresponders and employee message recipients. Dashboard employee totals count active employees with active logins.

Assignment options now include employment/login activity flags. Shared frontend employee APIs remove inactive/disabled entries before rendering. Assign New Work refreshes options each time it opens and when the page regains focus or visibility, removes selections that become inactive, and rejects stale recipient IDs on submission. Responses use `Cache-Control: no-store`; PWA employee-list routes use network-only requests with HTTP caching disabled, preventing old responses from restoring inactive names.

Internal project organization/team pickers and both project employee lists exclude inactive employment and disabled logins. Inactive client project managers are excluded from employee choices. Stored memberships and historical assignment records remain intact.

Employee status edits continue to synchronize login activation. Authorized login activation edits now synchronize active/inactive employment flags in a transaction and invalidate employee/detail/manager caches. Terminated employment is preserved, self-service cannot change activation, and final active organization admin cannot be disabled. Employee HTTP response caching was removed because those URL-based cache entries were not invalidated by employment changes; service caches remain tenant-scoped and are invalidated. Revised cache keys prevent older unfiltered entries from being reused.

Frontend keeps External Assignment recording and tab on employee page; admin reviews verbal work through All Assignments. Salary slips retain their records/download controls while History heading and raw employee/organization IDs are removed.

No schema migration or production data backfill is required. Source changes have not been published by this work. Regression tests use isolated local PostgreSQL and cover mismatched flags, active/all/inactive queries, tenant isolation, selector consistency, cached deactivation/reactivation, terminated records, and activation permissions.

Verification: 20 backend suites / 358 tests passed; backend and frontend production builds passed (99 frontend pages). PostgreSQL coverage includes project lists and membership preservation. Browser checks with mocked APIs confirmed inactive/disabled names are excluded, reopening/focus refreshes options and clears stale selections, assignment CRUD and filters work, and deletion closes after 48 hours. Read-only configured organization audit found 5 employees, 1 inactive/disabled, and 4 offered recipients with no inactive entries. Targeted frontend lint passed. Existing broader lint findings remain outside changed lines.

Real service worker browser check seeded stale employee responses and verified all 10 covered employee-list routes refused those cached responses while offline.
