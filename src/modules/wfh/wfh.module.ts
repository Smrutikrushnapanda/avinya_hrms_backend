import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhController } from './wfh.controller';
import { WfhService } from './wfh.service';
import { WfhRequest, WfhApproval, WfhApprovalAssignment, WfhBalance, WfhBalanceTemplate } from './entities';
import { MessageModule } from '../message/message.module';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Role } from '../auth-core/entities/role.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfhRequest,
      WfhApproval,
      WfhApprovalAssignment,
      WfhBalance,
      WfhBalanceTemplate,
      UserRole,
      Role,
      Employee,
      Organization,
    ]),
    MessageModule,
    AuthCoreModule,
  ],
  controllers: [WfhController],
  providers: [WfhService],
  exports: [WfhService],
})
export class WfhModule {}
