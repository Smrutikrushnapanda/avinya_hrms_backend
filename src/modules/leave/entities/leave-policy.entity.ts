import { Organization } from "src/modules/auth-core/entities/organization.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { LeaveType } from "./leave-type.entity";

@Entity('leave_policies')
export class LeavePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => LeaveType)
  @JoinColumn({ name: 'leave_type_id' })
  leaveType: LeaveType;

  @Column({ type: 'int' })
  yearlyAllocation: number;

  @Column({ default: false })
  canCarryForward: boolean;

  @Column({ type: 'int', nullable: true })
  maxCarryForward: number;

  @Column({ default: false })
  isEncashable: boolean;
}
