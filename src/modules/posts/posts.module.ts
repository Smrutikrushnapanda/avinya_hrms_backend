import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { Employee } from '../employee/entities/employee.entity';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { MessageModule } from '../message/message.module';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post,
      PostLike,
      PostComment,
      Employee,
      User,
      UserPushToken,
    ]),
    MessageModule,
    AuthCoreModule,
  ],
  providers: [PostsService],
  controllers: [PostsController],
})
export class PostsModule {}
