import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, unique: true })
  code: string;

  @Column({ nullable: true, type: 'text' })
  address_line1: string;

  @Column({ nullable: true, type: 'text' })
  address_line2: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true, type: 'numeric', precision: 9, scale: 6 })
  latitude: number;

  @Column({ nullable: true, type: 'numeric', precision: 9, scale: 6 })
  longitude: number;

  @Column()
  organization_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}