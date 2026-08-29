import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { MailService } from './mail.service';
import { PayrollRecord } from './entities/payroll-record.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import { PayrollNotification } from './entities/payroll-notification.entity';
import { EmployeeBankDetail } from './entities/employee-bank-detail.entity';
import { SalaryStructure } from './entities/salary-structure.entity';
import { SalaryStructureController } from './salary-structure.controller';
import { SalaryStructureService } from './salary-structure.service';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollRecord,
      PayrollSettings,
      PayrollNotification,
      EmployeeBankDetail,
      SalaryStructure,
      Employee,
      Organization,
    ]),
  ],
  controllers: [PayrollController, SalaryStructureController],
  providers: [PayrollService, MailService, SalaryStructureService],
  exports: [SalaryStructureService],
})
export class PayrollModule {}
