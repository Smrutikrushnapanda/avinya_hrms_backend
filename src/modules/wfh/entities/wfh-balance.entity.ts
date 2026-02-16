import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';

@Entity('wfh_balances')
export class WfhBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'opening_balance', type: 'float', default: 0 })
  openingBalance: number;

  @Column({ name: 'consumed', type: 'float', default: 0 })
  consumed: number;

  @Column({ name: 'closing_balance', type: 'float', default: 0 })
  closingBalance: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
