import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Role } from '../auth-core/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Attendance,
      LeaveRequest,
      UserRole,
      Role,
    ]),
    AuthCoreModule
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
