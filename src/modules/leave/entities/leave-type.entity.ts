import { Organization } from "src/modules/auth-core/entities/organization.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('leave_types')
@Unique(['name', 'organization'])
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Organization)
  @JoinColumn()
  organization: Organization;

  @Column({ default: true })
  isActive: boolean;
}
