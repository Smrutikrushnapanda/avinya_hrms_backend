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

@Entity('wifi_locations')
export class WifiLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'ssid' })
  ssid: string;

  @Column({ name: 'bssid' })
  bssid: string;

  @Column({ name: 'location_description', nullable: true })
  locationDescription: string;

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

  @Column({ name: 'allowed_radius_meters', type: 'int', default: 50 })
  allowedRadiusMeters: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
