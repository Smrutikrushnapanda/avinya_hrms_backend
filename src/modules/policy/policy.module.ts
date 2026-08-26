import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';
import { CompanyPolicy } from './entities/company-policy.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyPolicy, User, UserPushToken]),
    AuthCoreModule,
  ],
  controllers: [PolicyController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
