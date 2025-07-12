import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.entity';

@Entity({ name: 'user_roles' })
@Unique(['user', 'role']) // prevent duplicate assignments
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id' })
  role: Role;

  @Column({ name: 'assigned_by', type: 'varchar', nullable: true })
  assignedBy?: string;

  @CreateDateColumn({ name: 'assigned_on', type: 'timestamptz' })
  assignedOn: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}