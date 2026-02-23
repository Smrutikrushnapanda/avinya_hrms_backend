import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { BiometricDevice } from './biometric-device.entity';
import { Branch } from './branch.entity';

@Entity('attendance_logs')
export class AttendanceLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'timestamp', type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'type', type: 'varchar' })
  type: 'check-in' | 'check-out' | 'break-start' | 'break-end';

  @Column({ name: 'source', type: 'varchar' })
  source: 'mobile' | 'web' | 'biometric' | 'wifi' | 'manual';

  @Column({ name: 'photo_url', type: 'varchar', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'face_match_score', type: 'float', nullable: true })
  faceMatchScore: number;

  @Column({ name: 'face_verified', type: 'boolean', nullable: true })
  faceVerified: boolean;

  @Column({
    name: 'latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitude: number;

  @Column({
    name: 'longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitude: number;

  @Column({ name: 'location_address', nullable: true })
  locationAddress: string;

  @Column({ name: 'wifi_ssid', nullable: true })
  wifiSsid: string;

  @Column({ name: 'wifi_bssid', nullable: true })
  wifiBssid: string;

  @ManyToOne(() => BiometricDevice, { nullable: true })
  @JoinColumn({ name: 'biometric_device_id' })
  biometricDevice: BiometricDevice;

  @Column({ name: 'device_info', nullable: true })
  deviceInfo: string;

  @Column({ name: 'anomaly_flag', default: false })
  anomalyFlag: boolean;

  @Column({ name: 'anomaly_reason', type: 'text', nullable: true })
  anomalyReason: string | null;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
