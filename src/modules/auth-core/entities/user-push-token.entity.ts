import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PushTokenPlatform = 'android' | 'ios' | 'web';

// One row per device/browser a user has registered for push. A user can hold
// several at once (phone + laptop + a second browser) — a single-token
// column would silently drop one device whenever another registered.
@Entity('user_push_tokens')
export class UserPushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', unique: true })
  token: string;

  @Column({ type: 'varchar' })
  platform: PushTokenPlatform;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
