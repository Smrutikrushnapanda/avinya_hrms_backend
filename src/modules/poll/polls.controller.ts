import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Query,
  Delete,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { PollResponse } from './entities/poll-response.entity';
import {
  PollAnalyticsDto,
  PollWithAnalyticsDto,
  PollSummaryDto,
  SimpleQuestionResponseDto,
} from './dto/poll-analytics.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';

@ApiTags('Polls')
@RequireProPlan()
@Controller('polls')
@UseGuards(JwtAuthGuard)
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post('save-response')
  @ApiOperation({ summary: 'Submit a poll response' })
  @ApiBody({ description: 'Poll response object', type: Object })
  @ApiResponse({ status: 201, description: 'Response submitted successfully' })
  @ApiResponse({ status: 409, description: 'User already submitted response' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async submit(@GetUser() user: any, @Body() body: any): Promise<any> {
    try {
      return await this.pollsService.submitResponse(body, user.organizationId);
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
  create(@GetUser() user: any, @Body() createPollDto: CreatePollDto) {
    return this.pollsService.createPoll(createPollDto, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a poll' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  @ApiResponse({ status: 200, description: 'Poll deleted successfully' })
  deletePoll(@GetUser() user: any, @Param('id') id: string) {
    return this.pollsService.deletePoll(id, user.organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a poll partially' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  @ApiResponse({ status: 200, description: 'Poll updated successfully' })
  updatePoll(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() updateData: any,
  ) {
    return this.pollsService.updatePoll(id, updateData, user.organizationId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active poll for a user' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Optional user ID',
  })
  @ApiResponse({ status: 200, description: 'Active poll or message' })
  async getActivePoll(@GetUser() user: any, @Query('userId') userId?: string) {
    const result = await this.pollsService.getActivePoll(
      userId,
      user.organizationId,
    );
    if (!result) {
      return { message: 'No active poll available' };
    }
    return result;
  }

  // NEW: Get poll analytics with responses
  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get detailed poll analytics with all responses' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  @ApiResponse({
    status: 200,
    description: 'Poll analytics with response breakdown',
  })
  async getPollAnalytics(
    @GetUser() user: any,
    @Param('id') id: string,
  ): Promise<PollAnalyticsDto> {
    return this.pollsService.getPollAnalytics(id, user.organizationId);
  }

  // NEW: Get summary of all polls with response counts
  @Get('summary')
  @ApiOperation({ summary: 'Get summary of all polls with response counts' })
  @ApiResponse({
    status: 200,
    description: 'Polls summary with response statistics',
  })
  async getPollsSummary(@GetUser() user: any): Promise<PollSummaryDto[]> {
    return this.pollsService.getPollsSummary(user.organizationId);
  }

  // NEW: Get active polls with analytics
  @Get('active-with-analytics')
  @ApiOperation({ summary: 'Get active polls with response analytics' })
  @ApiResponse({ status: 200, description: 'Active polls with response data' })
  async getActivePollsWithAnalytics(
    @GetUser() user: any,
  ): Promise<PollWithAnalyticsDto[]> {
    return this.pollsService.getActivePollsWithAnalytics(user.organizationId);
  }

  @Get()
  @ApiOperation({ summary: 'List all polls' })
  findAll(@GetUser() user: any) {
    return this.pollsService.findAll(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get poll by ID' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  findOne(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.pollsService.findOne(id, user.organizationId);
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Add question to a poll' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  @ApiBody({ type: CreateQuestionDto })
  addQuestion(
    @GetUser() user: any,
    @Param('id') pollId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.pollsService.addQuestion(pollId, dto, user.organizationId);
  }

  @Get(':id/questions')
  @ApiOperation({ summary: 'Get questions for a poll' })
  @ApiParam({ name: 'id', description: 'Poll ID' })
  getQuestions(@GetUser() user: any, @Param('id') pollId: string) {
    return this.pollsService.getQuestions(pollId, user.organizationId);
  }

  //New API
  // Simplified endpoint - only essential employee response data
  @Get('questions/:questionId/employee-responses')
  @ApiOperation({
    summary:
      'Get all employees with their response status for a specific poll question',
  })
  @ApiParam({ name: 'questionId', description: 'Poll Question ID' })
  @ApiQuery({
    name: 'organizationId',
    required: false,
    description:
      'Organization ID (optional, will be derived from poll if not provided)',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of employees with their response status for the question',
  })
  async getEmployeeResponsesByQuestion(
    @Param('questionId') questionId: string,
    @Query('organizationId') organizationId?: string,
  ): Promise<SimpleQuestionResponseDto> {
    return this.pollsService.getEmployeeResponsesByQuestion(
      questionId,
      organizationId,
    );
  }
}
