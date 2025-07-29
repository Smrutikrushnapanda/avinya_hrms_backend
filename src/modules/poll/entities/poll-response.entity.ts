import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Poll } from './poll.entity';
import { PollQuestion } from './poll-question.entity';

@Entity('poll_responses')
@Unique('unique_user_response', ['poll_id', 'question_id', 'user_id'])
export class PollResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Poll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;

  @Column({ type: 'uuid' })
  poll_id: string;

  @ManyToOne(() => PollQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: PollQuestion;

  @Column({ type: 'uuid' })
  question_id: string;

  @Column({ type: 'uuid', nullable: true })
  user_id?: string;

  @Column('uuid', { array: true, default: () => "'{}'" })
  option_ids: string[];

  @Column({ type: 'text', nullable: true })
  response_text?: string;

  @Column({ type: 'int', nullable: true })
  response_rating?: number;

  @CreateDateColumn()
  submitted_at: Date;
}