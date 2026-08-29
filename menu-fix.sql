-- Idempotent menu-bootstrap script. Safe to run multiple times.
-- Inserts ANY menu item that is missing; never touches existing rows.
BEGIN;

-- Dashboard (/admin/dashboard)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Dashboard', 'LayoutDashboard', '/admin/dashboard', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 1, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/dashboard');

-- Employees (/admin/employees)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Employees', 'Users', '/admin/employees', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 2, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/employees');

-- Attendance (/admin/attendance)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Attendance', 'Calendar', '/admin/attendance', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 3, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/attendance');

-- Timesheet (/admin/timesheets)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Timesheet', 'BookMarked', '/admin/timesheets', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 4, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/timesheets');

-- Time Slips (/admin/timeslips)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Time Slips', 'Clock', '/admin/timeslips', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 5, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/timeslips');

-- Leave & WFH (group)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Leave & WFH', 'CalendarDays', NULL, NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 6, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE label = 'Leave & WFH' AND parent_id IS NULL);
WITH p AS (SELECT id FROM menu_items WHERE label = 'Leave & WFH' AND parent_id IS NULL)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, parent_id, is_active)
SELECT 'Leave', 'CalendarDays', '/admin/leave', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 1, p.id, true FROM p
WHERE NOT EXISTS (SELECT 1 FROM menu_items m, p WHERE m.route = '/admin/leave' AND m.parent_id = p.id);
WITH p AS (SELECT id FROM menu_items WHERE label = 'Leave & WFH' AND parent_id IS NULL)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, parent_id, is_active)
SELECT 'WFH', 'Home', '/admin/wfh', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 2, p.id, true FROM p
WHERE NOT EXISTS (SELECT 1 FROM menu_items m, p WHERE m.route = '/admin/wfh' AND m.parent_id = p.id);
WITH p AS (SELECT id FROM menu_items WHERE label = 'Leave & WFH' AND parent_id IS NULL)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, parent_id, is_active)
SELECT 'WFH Monitor', 'Monitor', '/admin/wfh-monitor', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 3, p.id, true FROM p
WHERE NOT EXISTS (SELECT 1 FROM menu_items m, p WHERE m.route = '/admin/wfh-monitor' AND m.parent_id = p.id);

-- Meetings (/admin/meetings)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Meetings', 'Video', '/admin/meetings', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 7, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/meetings');

-- Payroll (/admin/payroll)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Payroll', 'BadgeDollarSign', '/admin/payroll', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 8, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/payroll');

-- Salary Structure (/admin/salary-structure)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Salary Structure', 'Coins', '/admin/salary-structure', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 9, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/salary-structure');

-- Polls (/admin/polls)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Polls', 'Vote', '/admin/polls', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 10, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/polls');

-- Community Posts (/admin/posts)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Community Posts', 'MessageSquarePlus', '/admin/posts', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 11, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/posts');

-- Projects (/admin/projects)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Projects', 'FolderKanban', '/admin/projects', NULL, '["ADMIN"]', '["PRO","ENTERPRISE"]', 12, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/projects');

-- Assign Work (/admin/assign-work)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Assign Work', 'ListTodo', '/admin/assign-work', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 13, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/assign-work');

-- Performance (/admin/performance)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Performance', 'TrendingUp', '/admin/performance', 'performance_enabled', '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 14, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/performance');

-- Policy (/admin/policy)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Policy', 'Shield', '/admin/policy', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 15, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/policy');

-- Expenses (/admin/expenses)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Expenses', 'Receipt', '/admin/expenses', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 16, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/expenses');

-- Office Trips (/admin/office-trips)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Office Trips', 'Plane', '/admin/office-trips', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 17, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/office-trips');

-- Messages (/admin/messages)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Messages', 'MessageSquarePlus', '/admin/messages', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 18, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/messages');

-- Settings (/admin/settings)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Settings', 'Settings', '/admin/settings', NULL, '["ADMIN","HR"]', '["BASIC","PRO","ENTERPRISE"]', 19, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/settings');

-- Reports (/admin/reports)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Reports', 'BookMarked', '/admin/reports', NULL, '["ADMIN","HR"]', '["PRO","ENTERPRISE"]', 20, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/reports');

-- Log Report (/admin/logreport)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Log Report', 'FileText', '/admin/logreport', NULL, '["ADMIN"]', '["PRO","ENTERPRISE"]', 21, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/admin/logreport');

-- Dashboard (/user/dashboard)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Dashboard', 'LayoutDashboard', '/user/dashboard', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 1, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/dashboard');

-- Attendance (/user/attendance)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Attendance', 'Calendar', '/user/attendance', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 2, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/attendance');

-- Timesheet (/user/timesheet)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Timesheet', 'BookMarked', '/user/timesheet', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 3, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/timesheet');

-- Leave (/user/leave)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Leave', 'CalendarDays', '/user/leave', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 6, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/leave');

-- WFH (/user/wfh)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'WFH', 'Home', '/user/wfh', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 7, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/wfh');

-- Time Slips (/user/timeslips)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Time Slips', 'Clock', '/user/timeslips', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 8, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/timeslips');

-- Salary Slips (/user/payroll)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Salary Slips', 'BadgeDollarSign', '/user/payroll', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 9, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/payroll');

-- Expenses & Travels (/user/expenses)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Expenses & Travels', 'Receipt', '/user/expenses', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 10, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/expenses');

-- Messages (/user/messages)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Messages', 'Users', '/user/messages', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 11, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/messages');

-- Polls (/user/polls)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Polls', 'Vote', '/user/polls', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 12, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/polls');

-- Policy (/user/policy)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Policy', 'Shield', '/user/policy', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 13, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/policy');

-- My Meetings (/user/meetings)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'My Meetings', 'Video', '/user/meetings', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 14, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/meetings');

-- Employees (/user/employees)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Employees', 'Users', '/user/employees', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 15, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/employees');

-- Posts (/user/posts)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Posts', 'LayoutDashboard', '/user/posts', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 16, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/posts');

-- Notifications (/user/notifications)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Notifications', 'Bell', '/user/notifications', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 17, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/notifications');

-- My Profile (/user/profile)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'My Profile', 'UserRound', '/user/profile', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 18, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/profile');

-- My Projects (/user/projects)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'My Projects', 'FolderKanban', '/user/projects', NULL, '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 4, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/projects');

-- Performance (/user/performance)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Performance', 'TrendingUp', '/user/performance', 'performance_enabled', '["EMPLOYEE"]', '["PRO","ENTERPRISE"]', 19, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/performance');

-- WFH Monitor (/user/wfh-monitor)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'WFH Monitor', 'Monitor', '/user/wfh-monitor', 'wfh_approved_today', '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 20, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/wfh-monitor');

-- Assign Work (/user/assign-work)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Assign Work', 'ListTodo', '/user/assign-work', NULL, '["EMPLOYEE"]', '["BASIC","PRO","ENTERPRISE"]', 5, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/user/assign-work');

-- Dashboard (/superadmin/dashboard)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Dashboard', 'LayoutDashboard', '/superadmin/dashboard', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 1, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/dashboard');

-- Organizations (/superadmin/organizations)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Organizations', 'Users', '/superadmin/organizations', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 2, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/organizations');

-- Pricing Plans (/superadmin/plans)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Pricing Plans', 'BadgeDollarSign', '/superadmin/plans', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 3, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/plans');

-- Subscriptions (/superadmin/subscriptions)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Subscriptions', 'BookMarked', '/superadmin/subscriptions', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 4, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/subscriptions');

-- System Logs (/superadmin/logs)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'System Logs', 'FileText', '/superadmin/logs', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 5, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/logs');

-- Menu Items (/superadmin/menu-items)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Menu Items', 'ListTree', '/superadmin/menu-items', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 6, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/menu-items');

-- Revenue (/superadmin/revenue)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Revenue', 'TrendingUp', '/superadmin/revenue', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 3, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/revenue');

-- Renewals (/superadmin/renewals)
INSERT INTO menu_items (label, icon_name, route, condition, roles, plan_tiers, sort_order, is_active)
SELECT 'Renewals', 'Bell', '/superadmin/renewals', NULL, '["SUPERADMIN"]', '["BASIC","PRO","ENTERPRISE"]', 5, true
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE route = '/superadmin/renewals');

COMMIT;
