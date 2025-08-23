import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { EmployeeModule } from '../employee/employee.module';
import { AuthCoreModule } from '../auth-core/auth-core.module';

@Module({
  imports: [
    EmployeeModule,    // Import to use EmployeeService, DepartmentService, DesignationService
    AuthCoreModule,    // For authentication guards and decorators
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
