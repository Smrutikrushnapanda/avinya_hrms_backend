import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Poll } from './poll.entity';
import { PollOption } from './poll-option.entity';
import { QuestionType } from '../dto/create-question.dto';

@Entity('poll_questions')
export class PollQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Poll, (poll) => poll.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;

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
