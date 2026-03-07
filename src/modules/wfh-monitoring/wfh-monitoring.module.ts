import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfhMonitoringController } from './wfh-monitoring.controller';
import { WfhMonitoringService } from './wfh-monitoring.service';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhHeartbeatSnapshot } from './entities/wfh-heartbeat-snapshot.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WfhActivityLog, WfhHeartbeatSnapshot, WfhRequest]),
    AuthCoreModule,
  ],
  controllers: [WfhMonitoringController],
  providers: [WfhMonitoringService],
  exports: [WfhMonitoringService],
})
export class WfhMonitoringModule {}
