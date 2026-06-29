import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  @ManyToOne(() => MenuItem, (item) => item.children, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent?: MenuItem;

  @OneToMany(() => MenuItem, (item) => item.parent)
  children: MenuItem[];

  @Column()
  label: string;

  @Column({ name: 'icon_name', nullable: true })
  iconName?: string;

  @Column({ nullable: true })
  route?: string;

  @Column({ type: 'jsonb', default: ['ADMIN', 'HR', 'EMPLOYEE'] })
  roles: string[];

  @Column({
    name: 'plan_tiers',
    type: 'jsonb',
    default: ['BASIC', 'PRO', 'ENTERPRISE'],
  })
  planTiers: string[];

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'condition', nullable: true })
  condition?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
