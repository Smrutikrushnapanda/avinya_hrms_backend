import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhMonitoringController } from './wfh-monitoring.controller';
import { WfhMonitoringService } from './wfh-monitoring.service';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhHeartbeatSnapshot } from './entities/wfh-heartbeat-snapshot.entity';
import { WfhAppActivity } from './entities/wfh-app-activity.entity';
import { WfhAppSummary } from './entities/wfh-app-summary.entity';
import { WfhMonitoringSession } from './entities/wfh-monitoring-session.entity';
import { WfhMonitoringTacAcceptance } from './entities/wfh-monitoring-tac-acceptance.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';
import { Employee } from '../employee/entities/employee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfhActivityLog,
      WfhHeartbeatSnapshot,
      WfhAppActivity,
      WfhAppSummary,
      WfhMonitoringSession,
      WfhMonitoringTacAcceptance,
      WfhRequest,
      Employee,
    ]),
    AuthCoreModule,
  ],
  controllers: [WfhMonitoringController],
  providers: [WfhMonitoringService],
  exports: [WfhMonitoringService],
})
export class WfhMonitoringModule {}
