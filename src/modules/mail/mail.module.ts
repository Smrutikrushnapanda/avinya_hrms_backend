import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from './mail.service';
import { Organization } from '../auth-core/entities/organization.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
