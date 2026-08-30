import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../dto/auth.dto';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';

const NO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.token,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET_KEY,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
      relations: [
        'userRoles',
        'userRoles.role',
        'userRoles.role.rolePermissions',
        'userRoles.role.rolePermissions.permission',
      ],
      select: ['id', 'isActive', 'organizationId'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact your administrator.',
      );
    }

    // Validate JWT org matches DB user org (prevent stale tokens after org reassignment)
    if (
      payload.organizationId &&
      payload.organizationId !== NO_ORGANIZATION_ID
    ) {
      if (payload.organizationId !== user.organizationId) {
        throw new UnauthorizedException(
          'Your organization assignment has changed. Please log in again.',
        );
      }

      const organization = await this.organizationRepository.findOne({
        where: { id: payload.organizationId },
        select: ['id', 'isActive'],
      });

      if (!organization || organization.isActive === false) {
        throw new UnauthorizedException(
          'Your organization has been suspended. Contact support for assistance.',
        );
      }
    }

    // Fetch fresh roles/permissions from DB to prevent stale JWT data after role changes
    const freshRoles = (user.userRoles || [])
      .filter((ur: any) => ur.isActive && ur.role)
      .map((ur: any) => ({
        roleId: ur.role.id,
        roleName: ur.role.roleName,
        type: ur.role.type,
        description: ur.role.description,
      }));

    const freshPermissions = (user.userRoles || [])
      .filter((ur: any) => ur.isActive && ur.role)
      .flatMap((ur: any) =>
        (ur.role.rolePermissions || [])
          .filter((rp: any) => rp.isActive && rp.permission)
          .map((rp: any) => ({
            permissionId: rp.permission.id,
            permissionName: rp.permission.permissionName,
            description: rp.permission.description,
          })),
      );

    // Deduplicate permissions by permissionId
    const seenPermissionIds = new Set<string>();
    const dedupedPermissions = freshPermissions.filter((p: any) => {
      if (seenPermissionIds.has(p.permissionId)) return false;
      seenPermissionIds.add(p.permissionId);
      return true;
    });

    return {
      userId: payload.userId,
      userName: payload.userName,
      firstName: payload.firstName,
      middleName: payload.middleName,
      lastName: payload.lastName,
      gender: payload.gender,
      dob: payload.dob,
      email: payload.email,
      mobileNumber: payload.mobileNumber,
      organizationId: user.organizationId,
      roles: freshRoles.length > 0 ? freshRoles : payload.roles,
      permissions:
        dedupedPermissions.length > 0
          ? dedupedPermissions
          : payload.permissions,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}
