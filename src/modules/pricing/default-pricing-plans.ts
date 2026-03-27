import {
  IncludedFeatures,
  PlanFeature,
  PlanType,
} from './entities/pricing-plan.entity';

export type DefaultPricingPlanDefinition = {
  planType: PlanType;
  name: string;
  description: string;
  price: number;
  displayPrice: string;
  features: PlanFeature[];
  includedFeatures: IncludedFeatures;
  isActive: boolean;
  supportLevel: string;
  customizable: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export const DEFAULT_PRICING_PLANS: DefaultPricingPlanDefinition[] = [
  {
    planType: PlanType.BASIC,
    name: 'Basic',
    description:
      'Attendance-focused plan for teams that need attendance, leave, WFH, and timeslips across mobile, employee web, and admin web.',
    price: 299,
    displayPrice: '₹299/month',
    features: [
      { name: 'Attendance', available: true },
      { name: 'Leave Management', available: true },
      { name: 'Work From Home (WFH)', available: true },
      { name: 'Timesheet', available: true },
      { name: 'Employee Self Service', available: true },
      { name: 'Leave / WFH Approvals', available: true },
      { name: 'Basic Attendance Reports', available: true },
      { name: 'Mobile Service Tab', available: false },
      { name: 'Payroll', available: false },
      { name: 'Performance', available: false },
      { name: 'Projects', available: false },
      { name: 'Expenses', available: false },
      { name: 'Meetings', available: false },
      { name: 'Advanced Analytics', available: false },
    ],
    includedFeatures: {
      mobile: [
        'Attendance',
        'Leave Management',
        'WFH',
        'Timesheet',
        'No Service Tab',
      ],
      web: [
        'Attendance History',
        'Leave Requests',
        'WFH Requests',
        'Timeslips',
        'Basic Profile Access',
      ],
      admin: [
        'Attendance Dashboard',
        'Leave Approvals',
        'WFH Approvals',
        'Timeslip Review',
        'Basic Attendance Reports',
      ],
    },
    supportLevel: 'BASIC',
    customizable: false,
    isActive: true,
  },
  {
    planType: PlanType.PRO,
    name: 'Pro Launch',
    description:
      'Complete HRMS plan with all modules enabled across mobile, employee web, and admin web.',
    price: 499,
    displayPrice: '₹499/month',
    features: [
      { name: 'Attendance', available: true },
      { name: 'Leave Management', available: true },
      { name: 'Work From Home (WFH)', available: true },
      { name: 'Timesheet', available: true },
      { name: 'Dashboard', available: true },
      { name: 'Payroll', available: true },
      { name: 'Performance', available: true },
      { name: 'Projects', available: true },
      { name: 'Expenses', available: true },
      { name: 'Meetings', available: true },
      { name: 'Advanced Analytics', available: true },
      { name: 'Employee Portal', available: true },
      { name: 'Chat & Messaging', available: true },
      { name: 'Document Management', available: true },
      { name: 'Custom Reports', available: true },
      { name: 'Policies & Notices', available: true },
    ],
    includedFeatures: {
      mobile: [
        'All Employee Tabs',
        'Attendance',
        'Leave Management',
        'WFH',
        'Timesheet',
        'Service Tools',
        'Chat & Updates',
      ],
      web: [
        'Full Employee Portal',
        'Payroll',
        'Projects',
        'Expenses',
        'Document Management',
        'Meetings',
        'Self Service Workflows',
      ],
      admin: [
        'Attendance & Leave Operations',
        'Payroll',
        'Performance',
        'Projects & Expenses',
        'Meetings',
        'Analytics',
        'Policies & Notices',
      ],
    },
    supportLevel: 'PRIORITY',
    customizable: false,
    isActive: true,
  },
  {
    planType: PlanType.ENTERPRISE,
    name: 'Enterprise',
    description:
      'Dedicated enterprise rollout with isolated data, own database, organization-specific customization, and highest priority support.',
    price: 0,
    displayPrice: 'Contact Sales',
    features: [
      { name: 'Everything in Pro', available: true },
      { name: 'Dedicated Database', available: true },
      { name: 'Isolated Data Environment', available: true },
      { name: 'Custom Integrations', available: true },
      { name: 'Custom Workflows', available: true },
      { name: 'Advanced Security', available: true },
      { name: 'Custom Features', available: true },
      { name: 'Priority Support', available: true },
    ],
    includedFeatures: {
      mobile: ['Everything in Pro Launch', 'Optional Custom Mobile Scope'],
      web: [
        'Everything in Pro Launch',
        'Customized Employee Experience',
        'Custom Modules',
      ],
      admin: [
        'Everything in Pro Launch',
        'Dedicated Database Planning',
        'Custom Workflows',
        'Custom Reporting',
        'Priority Support Lane',
      ],
    },
    supportLevel: 'DEDICATED',
    customizable: true,
    contactEmail: 'sales@avinya-hrms.com',
    contactPhone: null,
    isActive: true,
  },
];
