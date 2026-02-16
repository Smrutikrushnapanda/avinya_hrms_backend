import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Organization } from '../../auth-core/entities/organization.entity';

@Entity('attendance_settings')
export class AttendanceSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @OneToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  // Office Timing Configuration
  @Column({ name: 'work_start_time', type: 'time', default: '09:00:00' })
  workStartTime!: string;

  @Column({ name: 'work_end_time', type: 'time', default: '18:00:00' })
  workEndTime!: string;

  @Column({ name: 'grace_minutes', type: 'int', default: 15 })
  graceMinutes!: number;

  @Column({ name: 'late_threshold_minutes', type: 'int', default: 30 })
  lateThresholdMinutes!: number;

  // Location Configuration
  @Column({ name: 'office_latitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  officeLatitude!: number | null;

  @Column({ name: 'office_longitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  officeLongitude!: number | null;

  @Column({ name: 'office_location_name', type: 'varchar', nullable: true })
  officeLocationName!: string | null;

  @Column({ name: 'office_location_address', type: 'varchar', nullable: true })
  officeLocationAddress!: string | null;

  @Column({ name: 'allowed_radius_meters', type: 'int', default: 100 })
  allowedRadiusMeters!: number;

  // Validation Toggles
  @Column({ name: 'enable_gps_validation', type: 'boolean', default: true })
  enableGpsValidation!: boolean;

  @Column({ name: 'enable_wifi_validation', type: 'boolean', default: false })
  enableWifiValidation!: boolean;

  @Column({ name: 'enable_face_validation', type: 'boolean', default: true })
  enableFaceValidation!: boolean;

  @Column({ name: 'enable_checkin_validation', type: 'boolean', default: true })
  enableCheckinValidation!: boolean;

  @Column({ name: 'enable_checkout_validation', type: 'boolean', default: true })
  enableCheckoutValidation!: boolean;

  // Half Day Configuration
  @Column({ name: 'half_day_cutoff_time', type: 'time', default: '14:00:00' })
  halfDayCutoffTime!: string;

  // Working Days Configuration (0=Sun ... 6=Sat)
  @Column({
    name: 'working_days',
    type: 'int',
    array: true,
    default: () => "'{1,2,3,4,5,6}'",
  })
  workingDays!: number[];

  // Optional: Weekday off rules by week-of-month (keys: 1-5 as strings)
  @Column({
    name: 'weekday_off_rules',
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'",
  })
  weekdayOffRules!: Record<string, number[]>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
