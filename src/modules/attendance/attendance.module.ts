import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance, AttendanceLog, BiometricDevice, WifiLocation, AttendanceSettings, Branch } from './entities';

import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { Common } from '../common/common.service';
import { LeaveRequest } from '../leave/entities';
import { Holiday } from '../leave/entities';
import { Employee } from '../employee/entities/employee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
        AttendanceLog,
        Attendance,
        BiometricDevice,
        WifiLocation,
        AttendanceSettings,
        Branch,
        LeaveRequest,
        Holiday,
        Employee,
      ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, Common],
  exports: [TypeOrmModule],
})
export class AttendanceModule {}
