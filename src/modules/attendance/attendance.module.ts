import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance, AttendanceLog, BiometricDevice, WifiLocation } from './entities';

import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { Common } from '../common/common.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
        AttendanceLog,
        Attendance,
        BiometricDevice,
        WifiLocation,
      ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, Common],
  exports: [TypeOrmModule], // if you want to use these in other modules
})
export class AttendanceModule {}
