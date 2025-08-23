import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { DesignationService } from './designation.service';
import { DesignationController } from './designation.controller';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Role } from '../auth-core/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Department,
      Designation,
      Attendance,
      LeaveRequest,
      UserRole,
      Role,
    ]),
    AuthCoreModule
  ],
  controllers: [
    EmployeeController,
    DepartmentController,
    DesignationController,
  ],
  providers: [
    EmployeeService,
    DepartmentService,
    DesignationService,
  ],
  exports: [
    EmployeeService,
    DepartmentService,
    DesignationService,
  ],
})
export class EmployeeModule {}
