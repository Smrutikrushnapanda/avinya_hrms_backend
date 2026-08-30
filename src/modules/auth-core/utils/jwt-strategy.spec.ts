import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../entities/user.entity';
import { Organization } from '../entities/organization.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy — Tenant & Auth Isolation', () => {
  let strategy: JwtStrategy;

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockOrgRepo = {
    findOne: jest.fn(),
  };

  const NO_ORG_ID = '00000000-0000-0000-0000-000000000000';

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET_KEY: 'test-secret-key' };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
      ],
    }).compile();
    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 1: Reject inactive user with 401
  // ════════════════════════════════════════════════════════════════════════
  it('should reject inactive users with 401', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: false,
      organizationId: 'org-1',
    });

    await expect(
      strategy.validate({
        userId: 'user-1',
        organizationId: 'org-1',
        userName: 'test',
        firstName: 'Test',
        middleName: null,
        lastName: 'User',
        gender: null,
        dob: null,
        email: 'test@example.com',
        mobileNumber: null,
        roles: [],
        permissions: [],
        mustChangePassword: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 2: Reject non-existent user with 401
  // ════════════════════════════════════════════════════════════════════════
  it('should reject non-existent users with 401', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({
        userId: 'nonexistent',
        organizationId: 'org-1',
        userName: 'ghost',
        firstName: 'Ghost',
        middleName: null,
        lastName: 'User',
        gender: null,
        dob: null,
        email: 'ghost@example.com',
        mobileNumber: null,
        roles: [],
        permissions: [],
        mustChangePassword: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 3: Reject suspended organization
  // ════════════════════════════════════════════════════════════════════════
  it('should reject users whose organization is suspended', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      organizationId: 'org-1',
    });
    mockOrgRepo.findOne.mockResolvedValue({
      id: 'org-1',
      isActive: false,
    });

    await expect(
      strategy.validate({
        userId: 'user-1',
        organizationId: 'org-1',
        userName: 'test',
        firstName: 'Test',
        middleName: null,
        lastName: 'User',
        gender: null,
        dob: null,
        email: 'test@example.com',
        mobileNumber: null,
        roles: [],
        permissions: [],
        mustChangePassword: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 4: Allow active user with active organization
  // ════════════════════════════════════════════════════════════════════════
  it('should allow active users with active organization', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      organizationId: 'org-1',
    });
    mockOrgRepo.findOne.mockResolvedValue({
      id: 'org-1',
      isActive: true,
    });

    const result = await strategy.validate({
      userId: 'user-1',
      organizationId: 'org-1',
      userName: 'testuser',
      firstName: 'Test',
      middleName: null,
      lastName: 'User',
      gender: 'M',
      dob: null,
      email: 'test@example.com',
      mobileNumber: '1234567890',
      roles: [{ id: 'role-1', roleName: 'EMPLOYEE' }],
      permissions: [],
      mustChangePassword: false,
    });

    expect(result).toBeDefined();
    expect(result.userId).toBe('user-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.roles).toEqual([{ id: 'role-1', roleName: 'EMPLOYEE' }]);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 5: SUPERADMIN with NO_ORGANIZATION_ID skips org check
  // ════════════════════════════════════════════════════════════════════════
  it('should allow SUPERADMIN with NO_ORGANIZATION_ID to skip org check', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      isActive: true,
      organizationId: NO_ORG_ID,
    });

    const result = await strategy.validate({
      userId: 'admin-1',
      organizationId: NO_ORG_ID,
      userName: 'superadmin',
      firstName: 'Super',
      middleName: null,
      lastName: 'Admin',
      gender: 'M',
      dob: null,
      email: 'admin@example.com',
      mobileNumber: null,
      roles: [{ id: 'role-sa', roleName: 'SUPER_ADMIN' }],
      permissions: [],
      mustChangePassword: false,
    });

    expect(result).toBeDefined();
    expect(result.userId).toBe('admin-1');
    expect(result.organizationId).toBe(NO_ORG_ID);
    // Organization repo should NOT be called for SUPERADMIN
    expect(mockOrgRepo.findOne).not.toHaveBeenCalled();
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 6: Non-existent organization rejected
  // ════════════════════════════════════════════════════════════════════════
  it('should reject when organization does not exist', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      organizationId: 'org-ghost',
    });
    mockOrgRepo.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({
        userId: 'user-1',
        organizationId: 'org-ghost',
        userName: 'test',
        firstName: 'Test',
        middleName: null,
        lastName: 'User',
        gender: null,
        dob: null,
        email: 'test@example.com',
        mobileNumber: null,
        roles: [],
        permissions: [],
        mustChangePassword: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ════════════════════════════════════════════════════════════════════════
  // TEST 7: Returns correct shape with all JWT fields
  // ════════════════════════════════════════════════════════════════════════
  it('should return all expected fields from JWT payload', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      organizationId: 'org-1',
    });
    mockOrgRepo.findOne.mockResolvedValue({
      id: 'org-1',
      isActive: true,
    });

    const payload = {
      userId: 'user-1',
      userName: 'jdoe',
      firstName: 'John',
      middleName: 'M',
      lastName: 'Doe',
      gender: 'M',
      dob: new Date('1990-05-15'),
      email: 'john@example.com',
      mobileNumber: '+1234567890',
      organizationId: 'org-1',
      roles: [
        { id: 'role-admin', roleName: 'ADMIN' },
        { id: 'role-hr', roleName: 'HR' },
      ],
      permissions: [
        { id: 'perm-1', permissionName: 'read:employees' },
        { id: 'perm-2', permissionName: 'write:attendance' },
      ],
      mustChangePassword: false,
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      userId: 'user-1',
      userName: 'jdoe',
      firstName: 'John',
      middleName: 'M',
      lastName: 'Doe',
      gender: 'M',
      dob: new Date('1990-05-15'),
      email: 'john@example.com',
      mobileNumber: '+1234567890',
      organizationId: 'org-1',
      roles: [
        { id: 'role-admin', roleName: 'ADMIN' },
        { id: 'role-hr', roleName: 'HR' },
      ],
      permissions: [
        { id: 'perm-1', permissionName: 'read:employees' },
        { id: 'perm-2', permissionName: 'write:attendance' },
      ],
      mustChangePassword: false,
    });
  });
});
