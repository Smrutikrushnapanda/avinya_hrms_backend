import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PricingPlan } from './pricing-plan.entity';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
  TRIAL = 'TRIAL',
}

const decimalTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | number | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status_enum',
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus = SubscriptionStatus.ACTIVE;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date | null = null;

  @Column({ name: 'renewal_date', type: 'date', nullable: true })
  renewalDate: Date | null = null;

  @Column({ name: 'auto_renew', type: 'boolean', default: false })
  autoRenew: boolean = false;

  @Column({
    name: 'billing_cycle_months',
    type: 'integer',
    nullable: true,
    default: 1,
  })
  billingCycleMonths: number | null = 1;

  @Column({
    name: 'total_paid',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  totalPaid: number | null = null;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentMethod: string | null = null;

  @Column({ type: 'text', nullable: true })
  customizations: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => PricingPlan, (plan) => plan.subscriptions, {
    eager: true,
  })
  @JoinColumn({ name: 'plan_id' })
  plan!: PricingPlan;
}
