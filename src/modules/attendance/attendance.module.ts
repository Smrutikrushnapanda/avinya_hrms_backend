import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Attendance,
  AttendanceLog,
  BiometricDevice,
  WifiLocation,
  AttendanceSettings,
  Branch,
  AttendanceShift,
} from './entities';

import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { Common } from '../common/common.service';
import { LeaveRequest } from '../leave/entities';
import { Holiday } from '../leave/entities';
import { Employee } from '../employee/entities/employee.entity';
import { StorageService } from './storage.service';
import { OfficeTripRequest } from '../office-trip/entities/office-trip-request.entity';
import { WfhRequest, EmployeeWorkArrangement } from '../wfh/entities';
import { WfhActivityLog } from '../wfh-monitoring/entities/wfh-activity-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceLog,
      Attendance,
      BiometricDevice,
      WifiLocation,
      AttendanceSettings,
      Branch,
      AttendanceShift,
      LeaveRequest,
      Holiday,
      Employee,
      OfficeTripRequest,
      WfhRequest,
      EmployeeWorkArrangement,
      WfhActivityLog,
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, Common, StorageService],
  exports: [TypeOrmModule, AttendanceService],
})
export class AttendanceModule {}
