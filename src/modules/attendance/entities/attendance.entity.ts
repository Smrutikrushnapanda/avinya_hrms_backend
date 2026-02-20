import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { Branch } from './branch.entity';

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'in_time', type: 'timestamptz', nullable: true })
  inTime: Date;

  @Column({ name: 'out_time', type: 'timestamptz', nullable: true })
  outTime: Date;

  @Column({ name: 'working_minutes', type: 'int', nullable: true })
  workingMinutes: number;

  @Column({ name: 'status', type: 'varchar' })
  status:
    | 'present'
    | 'absent'
    | 'half-day'
    | 'late'
    | 'on-leave'
    | 'holiday'
    | 'weekend'
    | 'work-from-home';

  @Column({ name: 'in_photo_url', nullable: true })
  inPhotoUrl: string;

  @Column({
    name: 'in_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  inLatitude: number;

  @Column({
    name: 'in_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  inLongitude: number;

  @Column({ name: 'in_location_address', nullable: true })
  inLocationAddress: string;

  @Column({ name: 'in_wifi_ssid', nullable: true })
  inWifiSsid: string;

  @Column({ name: 'in_wifi_bssid', nullable: true })
  inWifiBssid: string;

  @Column({ name: 'in_device_info', nullable: true })
  inDeviceInfo: string;

  @Column({ name: 'out_photo_url', nullable: true })
  outPhotoUrl: string;

  @Column({
    name: 'out_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  outLatitude: number;

  @Column({
    name: 'out_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  outLongitude: number;

  @Column({ name: 'out_location_address', nullable: true })
  outLocationAddress: string;

  @Column({ name: 'out_wifi_ssid', nullable: true })
  outWifiSsid: string;

  @Column({ name: 'out_wifi_bssid', nullable: true })
  outWifiBssid: string;

  @Column({ name: 'out_device_info', nullable: true })
  outDeviceInfo: string;

  @Column({ name: 'anomaly_flag', default: false })
  anomalyFlag: boolean;

  @Column({ name: 'anomaly_reason', nullable: true })
  anomalyReason: string;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
