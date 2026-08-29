import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from './entities/meeting.entity';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { MessageModule } from '../message/message.module';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, User, UserPushToken]),
    AuthCoreModule,
    MessageModule,
  ],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
