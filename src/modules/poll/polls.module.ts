import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { Poll } from './entities/poll.entity';
import { PollQuestion } from './entities/poll-question.entity';
import { PollOption } from './entities/poll-option.entity';
import { PollResponse } from './entities/poll-response.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Poll, PollQuestion, PollOption, PollResponse])],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}