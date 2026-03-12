import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('payroll_settings')
@Unique(['organizationId'])
export class PayrollSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200, nullable: true })
  companyName?: string;

  @Column({ name: 'address', type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl?: string;

  @Column({ name: 'primary_color', type: 'varchar', length: 20, nullable: true })
  primaryColor?: string;

  @Column({ name: 'footer_note', type: 'text', nullable: true })
  footerNote?: string;

  @Column({ name: 'cin_number', type: 'varchar', length: 64, nullable: true })
  cinNumber?: string;

  @Column({ name: 'pan_number', type: 'varchar', length: 32, nullable: true })
  panNumber?: string;

  @Column({ name: 'tan_number', type: 'varchar', length: 32, nullable: true })
  tanNumber?: string;

  @Column({ name: 'gstin_number', type: 'varchar', length: 32, nullable: true })
  gstinNumber?: string;

  @Column({ name: 'pf_registration_number', type: 'varchar', length: 64, nullable: true })
  pfRegistrationNumber?: string;

  @Column({ name: 'esi_registration_number', type: 'varchar', length: 64, nullable: true })
  esiRegistrationNumber?: string;

  @Column({ name: 'custom_fields', type: 'jsonb', nullable: true, default: () => "'[]'" })
  customFields?: Array<{
    label: string;
    value: string;
  }>;
}
