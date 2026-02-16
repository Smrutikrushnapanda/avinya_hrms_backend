import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogReport } from './entities/log-report.entity';
import { LogReportSettings } from './entities/log-report-settings.entity';
import { LogReportService } from './log-report.service';
import { LogReportController } from './log-report.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LogReport, LogReportSettings])],
  controllers: [LogReportController],
  providers: [LogReportService],
  exports: [LogReportService],
})
export class LogReportModule {}
