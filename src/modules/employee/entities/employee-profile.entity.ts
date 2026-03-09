import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from './employee.entity';

@Entity('employee_profiles')
export class EmployeeProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl?: string;

  @Column({ name: 'aadhar_photo_url', type: 'text', nullable: true })
  aadharPhotoUrl?: string;

  @Column({ name: 'pan_card_photo_url', type: 'text', nullable: true })
  panCardPhotoUrl?: string;

  @Column({ name: 'passport_photo_url', type: 'text', nullable: true })
  passportPhotoUrl?: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ name: 'blood_group', length: 5, nullable: true })
  bloodGroup?: string;

  @Column({ name: 'personal_email', length: 150, nullable: true })
  personalEmail?: string;

  @Column({ name: 'contact_number', length: 20, nullable: true })
  contactNumber?: string;

  @Column({ name: 'emergency_contact_name', length: 100, nullable: true })
  emergencyContactName?: string;

  @Column({
    name: 'emergency_contact_relationship',
    length: 50,
    nullable: true,
  })
  emergencyContactRelationship?: string;

  @Column({ name: 'emergency_contact_phone', length: 15, nullable: true })
  emergencyContactPhone?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @OneToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee;
}

