import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('log_report_settings')
@Unique(['organizationId'])
export class LogReportSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}
