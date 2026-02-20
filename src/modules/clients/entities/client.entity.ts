import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'client_name', length: 150 })
  clientName: string;

  @Column({ name: 'client_code', length: 50, nullable: true })
  clientCode: string;

  @Column({ name: 'industry', length: 100, nullable: true })
  industry: string;

  @Column({ name: 'contact_name', length: 120, nullable: true })
  contactName: string;

  @Column({ name: 'contact_email', length: 150, nullable: true })
  contactEmail: string;

  @Column({ name: 'contact_phone', length: 30, nullable: true })
  contactPhone: string;

  @Column({ name: 'website', length: 200, nullable: true })
  website: string;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
