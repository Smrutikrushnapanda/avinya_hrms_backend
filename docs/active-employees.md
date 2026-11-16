# Active employee lists

Working employee directories and selectors require both `employees.status = 'active'` and `users.is_active = true`. This also excludes historical records whose employment and login flags disagree, without modifying those records.

Employee list endpoints treat omitted status, `active`, and `all` as active-only. Explicit Inactive management view remains available for reactivation and includes active employment records with disabled logins. Other explicit employment statuses remain available for administration. Historical attendance, assignments, payslips and project relationships are preserved.

Shared criteria apply to employee directories, paginated management lists, employee selectors, search suggestions, manager choices, organization hierarchy, birthday/recent-joiner lists, assignment recipient options/validation, performance working lists, poll nonresponders and employee message recipients. Dashboard employee totals count active employees with active logins.

Employee status edits continue to synchronize login activation. Authorized login activation edits now synchronize active/inactive employment flags in a transaction and invalidate employee/detail/manager caches. Terminated employment is preserved, self-service cannot change activation, and final active organization admin cannot be disabled. Employee HTTP response caching was removed because those URL-based cache entries were not invalidated by employment changes; service caches remain tenant-scoped and are invalidated. Revised cache keys prevent older unfiltered entries from being reused.

Frontend keeps External Assignment recording and tab on employee page; admin reviews verbal work through All Assignments. Salary slips retain their records/download controls while History heading and raw employee/organization IDs are removed.

No schema migration or production data backfill is required. Source changes have not been published by this work. Regression tests use isolated local PostgreSQL and cover mismatched flags, active/all/inactive queries, tenant isolation, selector consistency, cached deactivation/reactivation, terminated records, and activation permissions.

Verification: 19 backend suites / 323 tests passed; backend and frontend production builds passed (99 frontend pages). Browser checks with mocked APIs confirmed employee external recording remains, admin external tab/button are absent, and payslip History/ID labels are absent while current slip/download controls remain. Targeted frontend lint passed. Backend lint retains existing findings outside changed lines; changed/new lines have no findings.
