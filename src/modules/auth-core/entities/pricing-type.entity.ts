import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'pricing_types' })
export class PricingType {
  @PrimaryColumn({ name: 'type_id', type: 'int' })
  typeId: number;

  @Column({ name: 'type_name', type: 'varchar', length: 60, unique: true })
  typeName: string;

  @Column({ name: 'price', type: 'numeric', precision: 10, scale: 2, nullable: true })
  price?: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'billing_model', type: 'varchar', length: 30, default: 'MONTHLY' })
  billingModel: string;

  @Column({ name: 'is_custom_pricing', type: 'boolean', default: false })
  isCustomPricing: boolean;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;
}
