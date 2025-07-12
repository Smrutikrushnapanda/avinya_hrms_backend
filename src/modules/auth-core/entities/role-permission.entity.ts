import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Column,
  Unique,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity({ name: 'role_permissions' })
@Unique(['role', 'permission']) // Prevent duplicate combinations
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id' })
  role: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id', referencedColumnName: 'id' })
  permission: Permission;

  @Column({ name: 'assigned_by', type: 'varchar', nullable: true })
  assignedBy?: string;

  @CreateDateColumn({ name: 'assigned_on', type: 'timestamptz' })
  assignedOn: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}