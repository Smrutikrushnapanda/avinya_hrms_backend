import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';
import { CompanyPolicy } from './entities/company-policy.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyPolicy]), AuthCoreModule],
  controllers: [PolicyController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
