import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Subscription } from './subscription.entity';

export enum PlanType {
  BASIC = 'BASIC',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export interface PlanFeature {
  name: string;
  available: boolean;
}

export interface IncludedFeatures {
  mobile: string[];
  web: string[];
  admin: string[];
}

@Entity('pricing_plans')
export class PricingPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'plan_type',
    type: 'enum',
    enum: PlanType,
    enumName: 'pricing_plan_type_enum',
    unique: true,
  })
  planType!: PlanType;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description: string | null = null;

  @Column({ type: 'integer' })
  price!: number; // Price in rupees per month

  @Column({ name: 'display_price', type: 'text', nullable: true })
  displayPrice: string | null = null; // For display purposes, e.g., "₹299/month"

  @Column({
    type: 'jsonb',
    default: () => `'[]'`,
  })
  features: PlanFeature[] = [];

  @Column({ name: 'included_features', type: 'jsonb', nullable: true })
  includedFeatures: IncludedFeatures | null = null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true;

  @Column({
    name: 'support_level',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  supportLevel: string | null = null; // BASIC, PRIORITY, etc.

  @Column({ type: 'boolean', default: false })
  customizable: boolean = false; // For enterprise plan

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  contactEmail: string | null = null; // For enterprise inquiries

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  contactPhone: string | null = null; // For enterprise inquiries

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Subscription, (subscription) => subscription.plan)
  subscriptions!: Subscription[];
}
