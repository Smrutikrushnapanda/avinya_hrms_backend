import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('performance_reviews')
export class PerformanceReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'employee_id' })
  employee: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  // 'SELF' | 'MANAGER'
  @Column({ name: 'review_type', type: 'varchar', length: 20, default: 'SELF' })
  reviewType: string;

  @Column({ name: 'period', type: 'varchar', length: 50, nullable: true })
  period: string;

  // JSON array: [{questionId, question, answer}]
  @Column({ name: 'answers', type: 'jsonb' })
  answers: { questionId: string; question: string; answer: string }[];

  @Column({ name: 'overall_rating', type: 'float', nullable: true })
  overallRating: number;

  @Column({ name: 'comments', type: 'text', nullable: true })
  comments: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
