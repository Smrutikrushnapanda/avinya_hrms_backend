import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { Poll } from './entities/poll.entity';
import { PollQuestion } from './entities/poll-question.entity';
import { PollOption } from './entities/poll-option.entity';
import { PollResponse } from './entities/poll-response.entity';
import { Employee } from '../employee/entities/employee.entity'; // ADDED

@Module({
  imports: [TypeOrmModule.forFeature([Poll, PollQuestion, PollOption, PollResponse, Employee])], // ADDED Employee
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}
