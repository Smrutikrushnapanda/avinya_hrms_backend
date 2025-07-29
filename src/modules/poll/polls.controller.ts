import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateQuestionDto } from './dto/create-question.dto';

@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  create(@Body() createPollDto: CreatePollDto) {
    return this.pollsService.createPoll(createPollDto);
  }

   @Get('active')
  async getActivePoll() {
    const poll = await this.pollsService.getActivePoll();
    return poll ? poll : { message: 'No active poll available' };
  }

  @Get()
  findAll() {
    return this.pollsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pollsService.findOne(id);
  }

  @Post(':id/questions')
  addQuestion(@Param('id') pollId: string, @Body() dto: CreateQuestionDto) {
    return this.pollsService.addQuestion(pollId, dto);
  }

  @Get(':id/questions')
  getQuestions(@Param('id') pollId: string) {
    return this.pollsService.getQuestions(pollId);
  }
}
