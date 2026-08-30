import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationSettings } from 'src/modules/auth-core/entities/organization-settings.entity';
import { AttendanceSettings } from 'src/modules/attendance/entities/attendance-settings.entity';
import { OrganizationTimezoneService } from './organization-timezone.service';

/**
 * Global module exposing the canonical OrganizationTimezoneService.
 * @Global so any module can inject it without re-importing.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationSettings, AttendanceSettings]),
  ],
  providers: [OrganizationTimezoneService],
  exports: [OrganizationTimezoneService],
})
export class TimezoneModule {}
