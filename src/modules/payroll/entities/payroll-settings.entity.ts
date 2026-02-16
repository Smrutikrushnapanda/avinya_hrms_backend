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
}
