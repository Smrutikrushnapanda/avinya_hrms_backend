import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '../entities/menu-item.entity';

const MENU_DATA: Array<{
  label: string;
  iconName?: string;
  route?: string;
  condition?: string;
  roles: string[];
  planTiers: string[];
  sortOrder: number;
  children?: Array<{
    label: string;
    iconName?: string;
    route: string;
    condition?: string;
    roles: string[];
    planTiers: string[];
    sortOrder: number;
  }>;
}> = [
  {
    label: 'Dashboard',
    iconName: 'LayoutDashboard',
    route: '/admin/dashboard',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 1,
  },
  {
    label: 'Employees',
    iconName: 'Users',
    route: '/admin/employees',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 2,
  },
  {
    label: 'Attendance',
    iconName: 'Calendar',
    route: '/admin/attendance',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 3,
  },
  {
    label: 'Timesheet',
    iconName: 'BookMarked',
    route: '/admin/timesheets',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 4,
  },
  {
    label: 'Time Slips',
    iconName: 'Clock',
    route: '/admin/timeslips',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 5,
  },
  {
    label: 'Leave & WFH',
    iconName: 'CalendarDays',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 6,
    children: [
      {
        label: 'Leave',
        iconName: 'CalendarDays',
        route: '/admin/leave',
        roles: ['ADMIN', 'HR'],
        planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
        sortOrder: 1,
      },
      {
        label: 'WFH',
        iconName: 'Home',
        route: '/admin/wfh',
        roles: ['ADMIN', 'HR'],
        planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
        sortOrder: 2,
      },
      {
        label: 'WFH Monitor',
        iconName: 'Monitor',
        route: '/admin/wfh-monitor',
        roles: ['ADMIN', 'HR'],
        planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
        sortOrder: 3,
      },
    ],
  },
  {
    label: 'Meetings',
    iconName: 'Video',
    route: '/admin/meetings',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 7,
  },
  {
    label: 'Payroll',
    iconName: 'BadgeDollarSign',
    route: '/admin/payroll',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 8,
  },
  {
    label: 'Polls',
    iconName: 'Vote',
    route: '/admin/polls',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 9,
  },
  {
    label: 'Community Posts',
    iconName: 'MessageSquarePlus',
    route: '/admin/posts',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 10,
  },
  {
    label: 'Projects',
    iconName: 'FolderKanban',
    route: '/admin/projects',
    roles: ['ADMIN'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 11,
  },
  {
    label: 'Performance',
    iconName: 'TrendingUp',
    route: '/admin/performance',
    condition: 'performance_enabled',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 12,
  },
  {
    label: 'Policy',
    iconName: 'Shield',
    route: '/admin/policy',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 13,
  },
  {
    label: 'Expenses',
    iconName: 'Receipt',
    route: '/admin/expenses',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 14,
  },
  {
    label: 'Messages',
    iconName: 'MessageSquarePlus',
    route: '/admin/messages',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 15,
  },
  {
    label: 'Settings',
    iconName: 'Settings',
    route: '/admin/settings',
    roles: ['ADMIN', 'HR'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 16,
  },
  {
    label: 'Reports',
    iconName: 'BookMarked',
    route: '/admin/reports',
    roles: ['ADMIN', 'HR'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 17,
  },
  {
    label: 'Log Report',
    iconName: 'FileText',
    route: '/admin/logreport',
    roles: ['ADMIN'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 18,
  },
  {
    label: 'Dashboard',
    iconName: 'LayoutDashboard',
    route: '/user/dashboard',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 1,
  },
  {
    label: 'Attendance',
    iconName: 'Calendar',
    route: '/user/attendance',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 2,
  },
  {
    label: 'Timesheet',
    iconName: 'BookMarked',
    route: '/user/timesheet',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 3,
  },
  {
    label: 'Leave',
    iconName: 'CalendarDays',
    route: '/user/leave',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 4,
  },
  {
    label: 'WFH',
    iconName: 'Home',
    route: '/user/wfh',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 5,
  },
  {
    label: 'Time Slips',
    iconName: 'Clock',
    route: '/user/timeslips',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 6,
  },
  {
    label: 'Salary Slips',
    iconName: 'BadgeDollarSign',
    route: '/user/payroll',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 7,
  },
  {
    label: 'Expenses & Travels',
    iconName: 'Receipt',
    route: '/user/expenses',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 8,
  },
  {
    label: 'Messages',
    iconName: 'Users',
    route: '/user/messages',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 9,
  },
  {
    label: 'Polls',
    iconName: 'Vote',
    route: '/user/polls',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 10,
  },
  {
    label: 'Policy',
    iconName: 'Shield',
    route: '/user/policy',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 11,
  },
  {
    label: 'My Meetings',
    iconName: 'Video',
    route: '/user/meetings',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 12,
  },
  {
    label: 'Employees',
    iconName: 'Users',
    route: '/user/employees',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 13,
  },
  {
    label: 'Posts',
    iconName: 'LayoutDashboard',
    route: '/user/posts',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 14,
  },
  {
    label: 'Notifications',
    iconName: 'Bell',
    route: '/user/notifications',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 15,
  },
  {
    label: 'My Profile',
    iconName: 'UserRound',
    route: '/user/profile',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 16,
  },
  {
    label: 'My Projects',
    iconName: 'FolderKanban',
    route: '/user/projects',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 17,
  },
  {
    label: 'Performance',
    iconName: 'TrendingUp',
    route: '/user/performance',
    condition: 'performance_enabled',
    roles: ['EMPLOYEE'],
    planTiers: ['PRO', 'ENTERPRISE'],
    sortOrder: 18,
  },
  {
    label: 'WFH Monitor',
    iconName: 'Monitor',
    route: '/user/wfh-monitor',
    condition: 'wfh_approved_today',
    roles: ['EMPLOYEE'],
    planTiers: ['BASIC', 'PRO', 'ENTERPRISE'],
    sortOrder: 19,
  },
];

@Injectable()
export class MenuSeederService implements OnModuleInit {
  private readonly logger = new Logger(MenuSeederService.name);

  constructor(
    @InjectRepository(MenuItem)
    private readonly repo: Repository<MenuItem>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    const existing = await this.repo.count();
    if (existing > 0) {
      this.logger.log(
        `Menu items already seeded (${existing} rows), skipping.`,
      );
      return;
    }

    for (const item of MENU_DATA) {
      const children = item.children || [];
      const parent = await this.repo.save(
        this.repo.create({
          label: item.label,
          iconName: item.iconName,
          route: item.route,
          condition: item.condition,
          roles: item.roles,
          planTiers: item.planTiers,
          sortOrder: item.sortOrder,
          isActive: true,
        }),
      );

      for (const child of children) {
        await this.repo.save(
          this.repo.create({
            label: child.label,
            iconName: child.iconName,
            route: child.route,
            condition: child.condition,
            roles: child.roles,
            planTiers: child.planTiers,
            sortOrder: child.sortOrder,
            parentId: parent.id,
            isActive: true,
          }),
        );
      }
    }

    this.logger.log(`Seeded ${MENU_DATA.length} menu groups with children.`);
  }
}
