import { Organization } from "src/modules/auth-core/entities/organization.entity";
import { Role } from "src/modules/auth-core/entities/role.entity";
import { User } from "src/modules/auth-core/entities/user.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('leave_workflow_configs')
@Unique(['organization', 'level'])
export class LeaveWorkflowConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'int' })
  level: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User; // Optional: specific default approver

  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  role: Role; // Optional: role-based fallback

  @Column({ default: true })
  isActive: boolean;
}
