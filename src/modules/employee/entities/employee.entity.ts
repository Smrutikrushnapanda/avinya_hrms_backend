import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { Department } from './department.entity';
import { Designation } from './designation.entity';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Branch } from 'src/modules/attendance/entities/branch.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @Column({ name: 'designation_id', nullable: true })
  designationId: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId: string | null;

  @Column({ name: 'reporting_to', nullable: true })
  reportingTo: string;

  @Column({ name: 'employee_code', length: 20, unique: true })
  employeeCode: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'middle_name', length: 100, nullable: true })
  middleName: string;

  @Column({ name: 'last_name', length: 100, nullable: true })
  lastName: string;

  @Column({ name: 'gender', length: 10, nullable: true })
  gender: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ name: 'contact_number', length: 20, nullable: true })
  contactNumber: string;

  @Column({ name: 'personal_email', length: 150, nullable: true })
  personalEmail: string;

  @Column({ name: 'work_email', length: 150, unique: true, nullable: true })
  workEmail: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string;

  @Column({ name: 'aadhar_photo_url', type: 'text', nullable: true })
  aadharPhotoUrl: string;

  @Column({ name: 'pan_card_photo_url', type: 'text', nullable: true })
  panCardPhotoUrl: string;

  @Column({ name: 'passport_photo_url', type: 'text', nullable: true })
  passportPhotoUrl: string;

  @Column({ name: 'date_of_joining', type: 'date' })
  dateOfJoining: Date;

  @Column({ name: 'date_of_exit', type: 'date', nullable: true })
  dateOfExit: Date;

  @Column({ name: 'employment_type', length: 50, nullable: true })
  employmentType: string;

  @Column({ name: 'status', length: 20, default: 'active' })
  status: string;

  @Column({ name: 'blood_group', length: 5, nullable: true })
  bloodGroup: string;

  @Column({ name: 'emergency_contact_name', length: 100, nullable: true })
  emergencyContactName: string;

  @Column({
    name: 'emergency_contact_relationship',
    length: 50,
    nullable: true,
  })
  emergencyContactRelationship: string;

  @Column({ name: 'emergency_contact_phone', length: 15, nullable: true })
  emergencyContactPhone: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @ManyToOne(() => Designation, { nullable: true })
  @JoinColumn({ name: 'designation_id' })
  designation: Designation;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'reporting_to' })
  manager: Employee;
}
