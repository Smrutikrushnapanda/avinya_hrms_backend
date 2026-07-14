import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

export enum OfficeTripType {
  OFFICE_TRIP = 'OFFICE_TRIP',
  CLIENT_VISIT = 'CLIENT_VISIT',
  OTHER = 'OTHER',
}

export enum OfficeTripStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum OfficeTripAttachmentType {
  TRAVEL_TICKET = 'TRAVEL_TICKET',
  APPROVAL_LETTER = 'APPROVAL_LETTER',
  CLIENT_INVITATION = 'CLIENT_INVITATION',
  OTHER = 'OTHER',
}

export interface OfficeTripAttachment {
  type: string;
  url: string;
  fileName: string;
}

@Entity('office_trip_requests')
export class OfficeTripRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'trip_type', length: 20 })
  tripType: string;

  @Column({
    name: 'trip_type_other',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  tripTypeOther: string | null;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column({ name: 'start_time', type: 'varchar', length: 8, nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'varchar', length: 8, nullable: true })
  endTime: string | null;

  @Column({ name: 'client_office_name', length: 200 })
  clientOfficeName: string;

  @Column({ name: 'location', length: 200 })
  location: string;

  @Column({ name: 'purpose', type: 'text' })
  purpose: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'attachments', type: 'jsonb', default: () => "'[]'" })
  attachments: OfficeTripAttachment[];

  @Column({ name: 'status', length: 20, default: OfficeTripStatus.PENDING })
  status: string;

  @Column({ name: 'admin_remarks', type: 'text', nullable: true })
  adminRemarks: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
