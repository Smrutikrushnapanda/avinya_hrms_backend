import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Poll } from './entities/poll.entity';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository, In } from 'typeorm'; // ADDED In
import { CreatePollDto } from './dto/create-poll.dto';
import { PollQuestion } from './entities/poll-question.entity';
import { CreateQuestionDto, QuestionType } from './dto/create-question.dto';
import { PollOption } from './entities/poll-option.entity';
import { DateTime } from 'luxon';
import { PollResponse } from './entities/poll-response.entity';
import { Employee } from '../employee/entities/employee.entity'; // ADDED
import {
  PollAnalyticsDto,
  PollWithAnalyticsDto,
  PollSummaryDto,
  QuestionAnalyticsDto,
  OptionBreakdownDto,
  UserResponseDto
} from './dto/poll-analytics.dto';

interface CreatePollResponseDto {
  poll_id: string;
  question_id: string;
  user_id?: string;
  option_ids: string[];
  response_text?: string;
  response_rating?: number;
}

@Injectable()
export class PollsService {
  constructor(
    @InjectRepository(Poll)
    private pollRepo: Repository<Poll>,
    @InjectRepository(PollQuestion)
    private questionRepo: Repository<PollQuestion>,
    @InjectRepository(PollOption)
    private optionRepo: Repository<PollOption>,
    @InjectRepository(PollResponse)
    private readonly pollResponseRepo: Repository<PollResponse>,
    @InjectRepository(Employee) // ADDED
    private readonly employeeRepo: Repository<Employee>, // ADDED
  ) { }

  async createPoll(dto: CreatePollDto) {
    // Step 1: Save Poll
    const timeZone = 'Asia/Kolkata';
    const poll = this.pollRepo.create({
      title: dto.title,
      description: dto.description,
      is_anonymous: dto.isAnonymous,
      start_time: DateTime.fromISO(dto.startTime, { zone: 'Asia/Kolkata' })
        .toUTC()
        .toJSDate(),
      end_time: DateTime.fromISO(dto.endTime, { zone: 'Asia/Kolkata' })
        .toUTC()
        .toJSDate(),
      created_by: dto.createdBy,
    });

    await this.pollRepo.save(poll);

    // Step 2: Save Questions and Options
    for (const [index, questionDto] of dto.questions.entries()) {
      const question = this.questionRepo.create({
        poll: { id: poll.id },
        question_text: questionDto.text,
        question_type: questionDto.questionType as QuestionType,
        question_order: index + 1,
        is_required: true,
      });

      await this.questionRepo.save(question);

      // Step 3: Save Options (only for choice-based questions)
      if (questionDto.questionType === 'single_choice' || questionDto.questionType === 'multiple_choice') {
        const optionEntities = questionDto.options.map((opt, i) =>
          this.optionRepo.create({
            question_id: question.id,
            option_text: opt,
            option_order: i + 1,
          }),
        );

        await this.optionRepo.save(optionEntities);
      }
    }

    return { message: 'Poll created successfully', pollId: poll.id };
  }

  async getActivePoll(userId?: string): Promise<{
    poll: Poll;
    responses: PollResponse[];
  } | null> {
    const now = new Date();
    const poll = await this.pollRepo.findOne({
      where: [
        {
          start_time: LessThanOrEqual(now),
          end_time: MoreThanOrEqual(now),
        },
        {
          start_time: LessThanOrEqual(now),
          end_time: IsNull(),
        },
      ],
      relations: ['questions', 'questions.options'],
      order: { start_time: 'DESC' },
    });

    if (!poll) return null;

    let userResponses: PollResponse[] = [];
    if (userId) {
      userResponses = await this.pollResponseRepo.find({
        where: {
          poll_id: poll.id,
          user_id: userId,
        },
        relations: ['question'],
      });
    }

    return {
      poll,
      responses: userResponses,
    };
  }

  // UPDATED: Get detailed poll analytics with employee names
  async getPollAnalytics(pollId: string): Promise<PollAnalyticsDto> {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId },
      relations: ['questions', 'questions.options'],
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Get all responses for this poll
    const responses = await this.pollResponseRepo.find({
      where: { poll_id: pollId },
      relations: ['question'],
    });

    // Get unique user IDs who responded
    const userIds = Array.from(new Set(responses.map(r => r.user_id).filter(Boolean)));

    // Fetch employee names for these user IDs using In operator
    const employees = userIds.length > 0 
      ? await this.employeeRepo.find({
          where: { userId: In(userIds) },
          select: ['userId', 'firstName', 'lastName'],
        })
      : [];

    // Create a map of userId to employee name
    const userIdToNameMap = new Map<string, string>();
    employees.forEach(emp => {
      const fullName = `${emp.firstName} ${emp.lastName || ''}`.trim();
      userIdToNameMap.set(emp.userId, fullName);
    });

    const totalUniqueResponders = new Set(responses.map(r => r.user_id)).size;

    // Build analytics for each question
    const questionsAnalytics: QuestionAnalyticsDto[] = await Promise.all(
      poll.questions.map(async (question) => {
        const questionResponses = responses.filter(r => r.question_id === question.id);

        // Get options breakdown for choice-based questions
        let optionsBreakdown: OptionBreakdownDto[] = [];
        if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
          optionsBreakdown = question.options?.map(option => {
            const optionResponses = questionResponses.filter(r =>
              r.option_ids && r.option_ids.includes(option.id)
            );

            return {
              option_id: option.id,
              option_text: option.option_text,
              count: optionResponses.length,
              percentage: questionResponses.length > 0
                ? Math.round((optionResponses.length / questionResponses.length) * 100)
                : 0
            };
          }) || [];
        }

        // Get user responses (for non-anonymous polls) with employee names
        const userResponses: UserResponseDto[] = poll.is_anonymous ? [] : questionResponses.map(response => ({
          user_id: response.user_id || 'anonymous',
          employee_name: response.user_id ? (userIdToNameMap.get(response.user_id) || 'Unknown Employee') : 'Anonymous',
          selected_options: response.option_ids || [],
          response_text: response.response_text,
          response_rating: response.response_rating,
          submitted_at: response.submitted_at
        }));

        return {
          question_id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          total_responses: questionResponses.length,
          options_breakdown: optionsBreakdown,
          user_responses: userResponses
        };
      })
    );

    return {
      poll,
      total_responses: totalUniqueResponders,
      response_rate: 0, // You can calculate this if you have total employee count
      questions_analytics: questionsAnalytics
    };
  }

  // UPDATED: Get summary of all polls with response counts and creator names
  async getPollsSummary(): Promise<PollSummaryDto[]> {
    const polls = await this.pollRepo.find({
      relations: ['questions'],
      order: { created_at: 'DESC' }
    });

    // Get unique creator IDs
    const creatorIds = Array.from(new Set(polls.map(p => p.created_by)));

    // Fetch employee names for creators using In operator
    const employees = creatorIds.length > 0 
      ? await this.employeeRepo.find({
          where: { userId: In(creatorIds) },
          select: ['userId', 'firstName', 'lastName'],
        })
      : [];

    // Create a map of userId to employee name
    const creatorIdToNameMap = new Map<string, string>();
    employees.forEach(emp => {
      const fullName = `${emp.firstName} ${emp.lastName || ''}`.trim();
      creatorIdToNameMap.set(emp.userId, fullName);
    });

    const pollsSummary = await Promise.all(
      polls.map(async (poll) => {
        const responseCount = await this.pollResponseRepo
          .createQueryBuilder('response')
          .select('COUNT(DISTINCT response.user_id)', 'count')
          .where('response.poll_id = :pollId', { pollId: poll.id })
          .getRawOne();

        const now = new Date();
        const isActive: boolean = Boolean(
          (poll.start_time && poll.start_time <= now) &&
          (poll.end_time ? poll.end_time >= now : true)
        );

        return {
          id: poll.id,
          title: poll.title,
          description: poll.description,
          start_time: poll.start_time,
          end_time: poll.end_time,
          is_anonymous: poll.is_anonymous,
          created_by: poll.created_by,
          created_by_name: creatorIdToNameMap.get(poll.created_by) || 'Unknown',
          created_at: poll.created_at,
          updated_at: poll.updated_at,
          total_responses: parseInt(responseCount.count) || 0,
          is_active: isActive,
          questions: poll.questions?.length || 0
        };
      })
    );

    return pollsSummary;
  }

  // NEW: Get active polls with analytics
  async getActivePollsWithAnalytics(): Promise<PollWithAnalyticsDto[]> {
    const now = new Date();
    const activePolls = await this.pollRepo.find({
      where: [
        {
          start_time: LessThanOrEqual(now),
          end_time: MoreThanOrEqual(now),
        },
        {
          start_time: LessThanOrEqual(now),
          end_time: IsNull(),
        },
      ],
      relations: ['questions', 'questions.options'],
      order: { start_time: 'DESC' },
    });

    const pollsWithAnalytics = await Promise.all(
      activePolls.map(async (poll) => {
        const analytics = await this.getPollAnalytics(poll.id);
        return {
          poll,
          analytics
        };
      })
    );

    return pollsWithAnalytics;
  }

  async findAll(): Promise<Poll[]> {
    return await this.pollRepo.find({
      relations: ['questions', 'questions.options'],
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: string): Promise<Poll> {
    const poll = await this.pollRepo.findOne({
      where: { id },
      relations: ['questions', 'questions.options'],
    });

    if (!poll) throw new NotFoundException('Poll not found');
    return poll;
  }

  async addQuestion(pollId: string, dto: CreateQuestionDto) {
    const poll = await this.pollRepo.findOne({ where: { id: pollId } });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const question = this.questionRepo.create({
      poll: { id: pollId },
      question_text: dto.question_text,
      question_type: dto.question_type,
      is_required: dto.is_required ?? true,
      question_order: dto.question_order,
    });

    return await this.questionRepo.save(question);
  }

  async getQuestions(pollId: string): Promise<PollQuestion[]> {
    return await this.questionRepo.find({
      where: { poll: { id: pollId } },
      relations: ['options'],
      order: { question_order: 'ASC' },
    });
  }

  async submitResponse(data: CreatePollResponseDto): Promise<PollResponse> {
    // Validate that the poll and question exist
    const poll = await this.pollRepo.findOne({ where: { id: data.poll_id } });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const question = await this.questionRepo.findOne({ where: { id: data.question_id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const response = this.pollResponseRepo.create(data);
    return this.pollResponseRepo.save(response);
  }
}
