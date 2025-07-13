import { Organization } from "src/modules/auth-core/entities/organization.entity";
import { User } from "src/modules/auth-core/entities/user.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('leave_approval_assignments')
@Unique(['user', 'level'])
export class LeaveApprovalAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'approver_id' })
  approver: User;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'int' })
  level: number;

  @Column({ default: true })
  isActive: boolean;
}