import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../dto/auth.dto';
import { Organization } from '../entities/organization.entity';

const NO_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
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
    // Super admin tokens carry no real organization — skip the org check.
    if (
      payload.organizationId &&
      payload.organizationId !== NO_ORGANIZATION_ID
    ) {
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
      organizationId: payload.organizationId,
      roles: payload.roles,
      permissions: payload.permissions,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}
