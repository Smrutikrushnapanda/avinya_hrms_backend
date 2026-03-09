import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { Employee } from './entities/employee.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
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
import { LeaveModule } from '../leave/leave.module';
import { WfhModule } from '../wfh/wfh.module';
import { Branch } from '../attendance/entities/branch.entity';
import { StorageService } from '../attendance/storage.service';
import { ResignationRequest } from '../resignation/entities/resignation-request.entity';
import { WorkflowAssignment } from '../workflow/entities/workflow-assignment.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { Timeslip } from '../workflow/timeslip/entities/timeslip.entity';

@Module({
  imports: [
    CacheModule.register({
      ttl: 300, // 5 minutes default TTL
      max: 1000, // maximum number of items in cache
    }),
    TypeOrmModule.forFeature([
      Employee,
      EmployeeProfile,
      Department,
      Designation,
      Attendance,
      LeaveRequest,
      UserRole,
      Role,
      Branch,
      ResignationRequest,
      WorkflowAssignment,
      Timesheet,
      Timeslip,
    ]),
    AuthCoreModule,
    LeaveModule,
    WfhModule,
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
    StorageService,
  ],
  exports: [
    EmployeeService,
    DepartmentService,
    DesignationService,
  ],
})
export class EmployeeModule {}
