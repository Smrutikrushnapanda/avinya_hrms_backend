import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth-core/entities/user.entity';

export enum PostType {
  GENERAL = 'general',
  ANNOUNCEMENT = 'announcement',
  NEW_JOINER = 'new_joiner',
  CELEBRATION = 'celebration',
  EVENT = 'event',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({
    type: 'enum',
    enum: PostType,
    default: PostType.GENERAL,
  })
  postType: PostType;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_id', nullable: true })
  authorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

