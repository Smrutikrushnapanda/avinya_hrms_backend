import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEmailTemplate } from './entities/request-email-template.entity';
import { RequestEmailDelivery } from './entities/request-email-delivery.entity';
import { RequestEmailService } from './request-email.service';
import { RequestEmailController } from './request-email.controller';
import { Employee } from '../employee/entities/employee.entity';
import { User } from '../auth-core/entities/user.entity';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RequestEmailTemplate,
      RequestEmailDelivery,
      Employee,
      User,
      LeaveType,
    ]),
    MailModule,
  ],
  controllers: [RequestEmailController],
  providers: [RequestEmailService],
  exports: [RequestEmailService],
})
export class RequestEmailModule {}
