import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

export enum DocumentTemplateType {
  EXPERIENCE_LETTER = 'EXPERIENCE_LETTER',
  RELIEVING_LETTER = 'RELIEVING_LETTER',
  JOINING_LETTER = 'JOINING_LETTER',
}

@Entity('employee_document_templates')
@Index(['organizationId', 'templateType'])
export class EmployeeDocumentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({
    name: 'template_type',
    type: 'varchar',
    length: 50,
    default: DocumentTemplateType.EXPERIENCE_LETTER,
  })
  templateType: DocumentTemplateType;

  @Column({ name: 'template_name', length: 255 })
  templateName: string;

  @Column({ name: 'content', type: 'text' })
  content: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
