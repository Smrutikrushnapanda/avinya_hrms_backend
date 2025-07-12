import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('biometric_devices')
export class BiometricDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'device_code', unique: true })
  deviceCode: string;

  @Column({ name: 'location_name', nullable: true })
  locationName: string;

  @Column({ name: 'location_address', nullable: true })
  locationAddress: string;

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

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
