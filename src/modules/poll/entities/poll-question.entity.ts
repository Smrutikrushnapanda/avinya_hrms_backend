import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Poll } from './poll.entity';
import { PollOption } from './poll-option.entity';
import { QuestionType } from '../dto/create-question.dto';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('poll_questions')
export class PollQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Poll, (poll) => poll.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;

  @Index()
  @Column({ type: 'uuid' })
  poll_id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Index()
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column()
  question_text: string;

  @Column({ type: 'enum', enum: QuestionType })
  question_type: QuestionType;

  @Column({ default: true })
  is_required: boolean;

  @Column({ type: 'int', nullable: true })
  question_order?: number;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => PollOption, (opt) => opt.question)
  options: PollOption[];
}
