import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { PollResponse } from './entities/poll-response.entity';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Polls')
@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post('save-response')
  @ApiOperation({ summary: 'Submit a poll response' })
  @ApiBody({ description: 'Poll response object', type: Object }) // You can replace Object with a DTO
  @ApiResponse({ status: 201, description: 'Response submitted successfully' })
  @ApiResponse({ status: 409, description: 'User already submitted response' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async submit(@Body() body: any): Promise<PollResponse> {
    try {
      return await this.pollsService.submitResponse(body);
    } catch (error) {
      if (error.code === '23505') {
        throw new HttpException(
          'User has already submitted this response.',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        'Something went wrong',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new poll' })
  @ApiBody({ type: CreatePollDto })
  @ApiResponse({ status: 201, description: 'Poll created successfully' })
  create(@Body() createPollDto: CreatePollDto) {
    return this.pollsService.createPoll(createPollDto);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active poll for a user' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Optional user ID',
  })
  @ApiResponse({ status: 200, description: 'Active poll or message' })
  async getActivePoll(@Query('userId') userId?: string) {
    const result = await this.pollsService.getActivePoll(userId);
    if (!result) {
      return { message: 'No active poll available' };
    }
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List all polls' })
  findAll() {
    return this.pollsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get poll by ID' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  findOne(@Param('id') id: string) {
    return this.pollsService.findOne(id);
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Add question to a poll' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  @ApiBody({ type: CreateQuestionDto })
  addQuestion(@Param('id') pollId: string, @Body() dto: CreateQuestionDto) {
    return this.pollsService.addQuestion(pollId, dto);
  }

  @Get(':id/questions')
  @ApiOperation({ summary: 'Get questions for a poll' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  getQuestions(@Param('id') pollId: string) {
    return this.pollsService.getQuestions(pollId);
  }
}
