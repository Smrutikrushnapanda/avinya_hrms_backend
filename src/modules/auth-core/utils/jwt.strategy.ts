import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../dto/auth.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.token,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET_KEY,
    });
  }

  async validate(payload: JwtPayload) {
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
      mustChangePassword: payload.mustChangePassword,
    };
  }
}