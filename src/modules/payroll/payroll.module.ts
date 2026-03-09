import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { MailService } from './mail.service';
import { PayrollRecord } from './entities/payroll-record.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import { PayrollNotification } from './entities/payroll-notification.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PayrollRecord, PayrollSettings, PayrollNotification, Employee, Organization])],
  controllers: [PayrollController],
  providers: [PayrollService, MailService],
})
export class PayrollModule {}
