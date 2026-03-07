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

  // null = available to all genders; 'female' = maternity/female-only; 'male' = male-only
  @Column({ type: 'varchar', name: 'gender_restriction', nullable: true, length: 10 })
  genderRestriction: string | null;

  // true = this is an earned leave type (credited when employee works on weekends/holidays)
  @Column({ name: 'is_earned', default: false })
  isEarned: boolean;
}
