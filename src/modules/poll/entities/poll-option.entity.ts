import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PollQuestion } from './poll-question.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('poll_options')
export class PollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PollQuestion, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'question_id' })
  question: PollQuestion;

  @Index()
  @Column({ type: 'uuid' })
  question_id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Index()
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column()
  option_text: string;

  @Column({ type: 'int', nullable: true })
  option_order?: number;
}
