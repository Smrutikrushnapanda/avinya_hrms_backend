import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';

const ORG_EXAMPLE = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  organizationName: 'Avinya Technologies',
  email: 'contact@avinya.com',
  hrMail: 'hr@avinya.com',
  phone: '+91-9999999999',
  address: '123 Tech Park, Bhubaneswar, Odisha',
  logoUrl: 'https://example.com/logo.png',
  homeHeaderBackgroundColor: '#0b6aa2',
  homeHeaderMediaUrl: 'https://example.com/christmas-banner.gif',
  homeHeaderMediaStartDate: '2026-12-01',
  homeHeaderMediaEndDate: '2026-12-30',
  resignationPolicy: 'Employees must serve a 30-day notice period.',
  resignationNoticePeriodDays: 30,
  allowEarlyRelievingByAdmin: true,
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

export function SwaggerCreateOrganization() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new organization (auto-creates admin user)' }),
    ApiBody({
      schema: {
        example: {
          organizationName: 'Avinya Technologies',
          email: 'contact@avinya.com',
          hrMail: 'hr@avinya.com',
          phone: '+91-9999999999',
          address: '123 Tech Park, Bhubaneswar, Odisha',
          logoUrl: 'https://example.com/logo.png',
          homeHeaderBackgroundColor: '#0b6aa2',
          homeHeaderMediaUrl: 'https://example.com/christmas-banner.gif',
          homeHeaderMediaStartDate: '2026-12-01',
          homeHeaderMediaEndDate: '2026-12-30',
          resignationPolicy: 'Employees must serve a 30-day notice period.',
          resignationNoticePeriodDays: 30,
          allowEarlyRelievingByAdmin: true,
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Organization created. Returns org data + default admin credentials.',
      schema: {
        example: {
          ...ORG_EXAMPLE,
          adminUserName: 'avinya_hrms',
          adminDefaultPassword: 'password',
        },
      },
    }),
  );
}

export function SwaggerUpdateOrganization() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Update organization details' }),
    ApiParam({ name: 'id', type: String, example: 'a1b2c3d4-0000-0000-0000-000000000001' }),
    ApiBody({
      schema: {
        example: {
          name: 'Avinya Technologies Pvt Ltd',
          email: 'info@avinya.com',
          hrMail: 'hr@avinya.com',
          phone: '+91-8888888888',
          address: '456 Business Hub, Bhubaneswar',
          logoUrl: 'https://example.com/new-logo.png',
          homeHeaderBackgroundColor: '#b91c1c',
          homeHeaderMediaUrl: 'https://example.com/festival-banner.gif',
          homeHeaderMediaStartDate: '2026-12-01',
          homeHeaderMediaEndDate: '2026-12-30',
          resignationPolicy: 'Employees must serve a 45-day notice period.',
          resignationNoticePeriodDays: 45,
          allowEarlyRelievingByAdmin: false,
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Updated organization',
      schema: { example: { ...ORG_EXAMPLE, organizationName: 'Avinya Technologies Pvt Ltd' } },
    }),
    ApiResponse({ status: 404, description: 'Organization not found' }),
  );
}

export function SwaggerChangeCredentials() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Change admin credentials for an organization' }),
    ApiParam({ name: 'id', type: String, example: 'a1b2c3d4-0000-0000-0000-000000000001' }),
    ApiBody({
      schema: {
        example: {
          newUserName: 'avinya_admin',
          newPassword: 'MySecureP@ss123',
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Admin credentials updated. Returns updated user object.',
      schema: {
        example: {
          id: 'u1u2u3u4-0000-0000-0000-000000000001',
          userName: 'avinya_admin',
          email: 'admin@avinya.com',
          firstName: 'Org',
          lastName: 'Admin',
          isActive: true,
          mustChangePassword: false,
          organizationId: 'a1b2c3d4-0000-0000-0000-000000000001',
        },
      },
    }),
    ApiResponse({ status: 400, description: 'Username already taken' }),
    ApiResponse({ status: 404, description: 'Admin user not found in this organization' }),
  );
}

export function SwaggerDeleteOrganization() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Delete an organization and all its data' }),
    ApiParam({ name: 'id', type: String, example: 'a1b2c3d4-0000-0000-0000-000000000001' }),
    ApiResponse({
      status: 200,
      description: 'Organization deleted',
      schema: { example: { message: 'Organization deleted successfully' } },
    }),
    ApiResponse({ status: 404, description: 'Organization not found' }),
  );
}

export function SwaggerFindAllOrganizations() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all organizations' }),
    ApiResponse({
      status: 200,
      description: 'List of organizations',
      schema: { example: [ORG_EXAMPLE] },
    }),
  );
}

export function SwaggerFindOneOrganization() {
  return applyDecorators(
    ApiOperation({ summary: 'Get organization by ID (includes users and features)' }),
    ApiParam({ name: 'id', type: String, example: 'a1b2c3d4-0000-0000-0000-000000000001' }),
    ApiResponse({
      status: 200,
      description: 'Organization details',
      schema: {
        example: {
          ...ORG_EXAMPLE,
          name: 'Avinya Technologies',
          users: [
            {
              id: 'u1u2u3u4-0000-0000-0000-000000000001',
              userName: 'avinya_hrms',
              email: 'admin@avinya.com',
              isActive: true,
            },
          ],
          organizationFeatures: [],
        },
      },
    }),
    ApiResponse({ status: 404, description: 'Organization not found' }),
  );
}
