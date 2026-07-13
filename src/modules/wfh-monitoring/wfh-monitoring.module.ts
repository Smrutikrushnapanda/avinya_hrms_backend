import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhMonitoringController } from './wfh-monitoring.controller';
import { WfhMonitoringService } from './wfh-monitoring.service';
import { WfhMonitorReminderService } from './wfh-monitor-reminder.service';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhHeartbeatSnapshot } from './entities/wfh-heartbeat-snapshot.entity';
import { WfhAppActivity } from './entities/wfh-app-activity.entity';
import { WfhAppSummary } from './entities/wfh-app-summary.entity';
import { WfhMonitoringSession } from './entities/wfh-monitoring-session.entity';
import { WfhMonitoringTacAcceptance } from './entities/wfh-monitoring-tac-acceptance.entity';
import { WfhMonitorReminderState } from './entities/wfh-monitor-reminder-state.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { WfhRequest, EmployeeWorkArrangement } from '../wfh/entities';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { OrganizationSettings } from '../auth-core/entities/organization-settings.entity';
import { AttendanceModule } from '../attendance/attendance.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfhActivityLog,
      WfhHeartbeatSnapshot,
      WfhAppActivity,
      WfhAppSummary,
      WfhMonitoringSession,
      WfhMonitoringTacAcceptance,
      WfhMonitorReminderState,
      WfhRequest,
      EmployeeWorkArrangement,
      Employee,
      Organization,
      OrganizationSettings,
    ]),
    AuthCoreModule,
    AttendanceModule,
    MessageModule,
  ],
  controllers: [WfhMonitoringController],
  providers: [WfhMonitoringService, WfhMonitorReminderService],
  exports: [WfhMonitoringService],
})
export class WfhMonitoringModule {}
