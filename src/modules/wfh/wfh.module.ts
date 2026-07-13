import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhController } from './wfh.controller';
import { WfhService } from './wfh.service';
import {
  WfhRequest,
  WfhApproval,
  WfhApprovalAssignment,
  WfhBalance,
  WfhBalanceTemplate,
  EmployeeWfhLimitEntity,
  EmployeeWorkArrangement,
} from './entities';
import { MessageModule } from '../message/message.module';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Role } from '../auth-core/entities/role.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { OrganizationSettings } from '../auth-core/entities/organization-settings.entity';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfhRequest,
      WfhApproval,
      WfhApprovalAssignment,
      WfhBalance,
      WfhBalanceTemplate,
      EmployeeWfhLimitEntity,
      EmployeeWorkArrangement,
      UserRole,
      Role,
      Employee,
      Organization,
      OrganizationSettings,
    ]),
    MessageModule,
    forwardRef(() => AuthCoreModule),
    AttendanceModule,
  ],
  controllers: [WfhController],
  providers: [WfhService],
  exports: [WfhService, TypeOrmModule],
})
export class WfhModule {}
