import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import dataSource from './config/typeorm.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import { GlobalCacheModule } from './shared/cache.module';
import { AuthCoreModule } from './modules/auth-core/auth-core.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { PollsModule } from './modules/poll/polls.module';
import { NoticeModule } from './modules/notice/notice.module';
import { CommonModule } from './modules/common/common.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LogReportModule } from './modules/log-report/log-report.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { MessageModule } from './modules/message/message.module';
import { WfhModule } from './modules/wfh/wfh.module';
import { ChatModule } from './modules/chat/chat.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WfhMonitoringModule } from './modules/wfh-monitoring/wfh-monitoring.module';
import { PolicyModule } from './modules/policy/policy.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ProjectModule } from './modules/project/project.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { MeetingModule } from './modules/meeting/meeting.module';
import { MailModule } from './modules/mail/mail.module';
import { ResignationModule } from './modules/resignation/resignation.module';
import { PostsModule } from './modules/posts/posts.module';
import { UploadModule } from './modules/upload/upload.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LogReportInterceptor } from './shared/log-report.interceptor';
import { PlanAccessGuard } from './modules/pricing/guards/plan-access.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      ...dataSource.options,
      autoLoadEntities: true,
    }),
    (() => {
      const publicPath = join(__dirname, '..', 'public');
      const uploadsPath = join(publicPath, 'uploads');
      const chatPath = join(uploadsPath, 'chat');
      
      // Ensure directories exist
      if (!fs.existsSync(publicPath)) {
        fs.mkdirSync(publicPath, { recursive: true });
      }
      if (!fs.existsSync(uploadsPath)) {
        fs.mkdirSync(uploadsPath, { recursive: true });
      }
      if (!fs.existsSync(chatPath)) {
        fs.mkdirSync(chatPath, { recursive: true });
      }
      
      return ServeStaticModule.forRoot({
        rootPath: publicPath,
        serveRoot: '/static',
      });
    })(),
    GlobalCacheModule,
    ScheduleModule.forRoot(),
    AuthCoreModule,
    AttendanceModule,
    LeaveModule,
    EmployeeModule,
    PollsModule,
    NoticeModule,
    CommonModule,
    WorkflowModule,
    DashboardModule,
    LogReportModule,
    PayrollModule,
    MessageModule,
    WfhModule,
    ChatModule,
    ClientsModule,
    WfhMonitoringModule,
    PolicyModule,
    PerformanceModule,
    ProjectModule,
    ExpensesModule,
    MeetingModule,
    MailModule,
    ResignationModule,
    PostsModule,
    UploadModule,
    PricingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: PlanAccessGuard },
    { provide: APP_INTERCEPTOR, useClass: LogReportInterceptor },
  ],
})
export class AppModule {}
