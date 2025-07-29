import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Poll } from './entities/poll.entity';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollQuestion } from './entities/poll-question.entity';
import { CreateQuestionDto, QuestionType } from './dto/create-question.dto';
import { PollOption } from './entities/poll-option.entity';
import { DateTime } from 'luxon';

@Injectable()
export class PollsService {
  constructor(
    @InjectRepository(Poll)
    private pollRepo: Repository<Poll>,
    @InjectRepository(PollQuestion)
    private questionRepo: Repository<PollQuestion>,
    @InjectRepository(PollOption)
    private optionRepo: Repository<PollOption>,
  ) {}

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
        question_type: questionDto.questionType as QuestionType, // ✅ fixed property name
        question_order: index + 1,
        is_required: true,
      });

      await this.questionRepo.save(question);

      // Step 3: Save Options
      const optionEntities = questionDto.options.map((opt, i) =>
        this.optionRepo.create({
          question_id: question.id,
          option_text: opt,
          option_order: i + 1,
        }),
      );
      await this.optionRepo.save(optionEntities);
    }

    return { message: 'Poll created successfully', pollId: poll.id };
  }

  async getActivePoll(): Promise<Poll | null> {
    const now = new Date();

    return this.pollRepo.findOne({
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
      relations: ['questions', 'questions.options'], // Include nested options
      order: { start_time: 'DESC' },
    });
  }

  async findAll(): Promise<Poll[]> {
    return await this.pollRepo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<Poll> {
    const poll = await this.pollRepo.findOne({
      where: { id },
      relations: ['questions'],
    });
    if (!poll) throw new NotFoundException('Poll not found');
    return poll;
  }

  async addQuestion(pollId: string, dto: CreateQuestionDto) {
    const question = this.questionRepo.create({
      ...dto,
      id: pollId,
    });
    return await this.questionRepo.save(question);
  }

  async getQuestions(pollId: string): Promise<PollQuestion[]> {
    return await this.questionRepo.find({
      where: { id: pollId },
      order: { question_order: 'ASC' },
    });
  }
}
