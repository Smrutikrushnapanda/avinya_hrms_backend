import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PerformanceSettings } from './entities/performance-settings.entity';
import { PerformanceQuestion } from './entities/performance-question.entity';
import { PerformanceReview } from './entities/performance-review.entity';
import { Employee } from '../employee/entities/employee.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceSettings,
      PerformanceQuestion,
      PerformanceReview,
      Employee,
    ]),
    AuthCoreModule,
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
