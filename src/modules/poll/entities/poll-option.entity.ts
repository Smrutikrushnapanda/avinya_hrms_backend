import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PollQuestion } from './poll-question.entity';

@Entity('poll_options')
export class PollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PollQuestion, (question) => question.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: PollQuestion;

  @Column({ type: 'uuid' })
  question_id: string;

  @Column()
  option_text: string;

  @Column({ type: 'int', nullable: true })
  option_order?: number;
}
