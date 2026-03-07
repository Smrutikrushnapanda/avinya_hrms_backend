import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceSettings } from './entities/performance-settings.entity';
import { PerformanceQuestion } from './entities/performance-question.entity';
import { PerformanceReview } from './entities/performance-review.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(PerformanceSettings)
    private settingsRepo: Repository<PerformanceSettings>,
    @InjectRepository(PerformanceQuestion)
    private questionRepo: Repository<PerformanceQuestion>,
    @InjectRepository(PerformanceReview)
    private reviewRepo: Repository<PerformanceReview>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
  ) {}

  // ─── Settings ────────────────────────────────────────────────────────────

  async getSettings(orgId: string) {
    let settings = await this.settingsRepo.findOne({
      where: { organization: { id: orgId } },
    });
    if (!settings) {
      settings = this.settingsRepo.create({
        organization: { id: orgId },
        isEnabled: false,
        requireHrApproval: false,
      });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async toggleEnabled(orgId: string) {
    const settings = await this.getSettings(orgId);
    settings.isEnabled = !settings.isEnabled;
    return this.settingsRepo.save(settings);
  }

  async updateSettings(orgId: string, dto: UpdateSettingsDto) {
    const settings = await this.getSettings(orgId);
    if (dto.requireHrApproval !== undefined) {
      settings.requireHrApproval = dto.requireHrApproval;
    }
    return this.settingsRepo.save(settings);
  }

  // ─── Questions ────────────────────────────────────────────────────────────

  async getQuestions(orgId: string) {
    return this.questionRepo.find({
      where: { organization: { id: orgId }, isActive: true },
      order: { orderIndex: 'ASC' },
    });
  }

  async createQuestion(orgId: string, dto: CreateQuestionDto) {
    const question = this.questionRepo.create({
      organization: { id: orgId },
      question: dto.question,
      orderIndex: dto.orderIndex ?? 0,
    });
    return this.questionRepo.save(question);
  }

  async deleteQuestion(id: string, orgId: string) {
    const question = await this.questionRepo.findOne({
      where: { id, organization: { id: orgId } },
    });
    if (!question) throw new NotFoundException('Question not found');
    question.isActive = false;
    await this.questionRepo.save(question);
    return { success: true };
  }

  // ─── Manager check ────────────────────────────────────────────────────────

  async checkIsManager(userId: string, orgId: string): Promise<{ isManager: boolean }> {
    const emp = await this.employeeRepo.findOne({
      where: { userId, organizationId: orgId },
      select: ['id'],
    });
    if (!emp) return { isManager: false };
    const count = await this.employeeRepo.count({
      where: { reportingTo: emp.id, organizationId: orgId },
    });
    return { isManager: count > 0 };
  }

  // ─── HR check (by designation name) ──────────────────────────────────────

  async checkIsHr(userId: string, orgId: string): Promise<{ isHr: boolean }> {
    const emp = await this.employeeRepo.findOne({
      where: { userId, organizationId: orgId },
      relations: ['designation'],
    });
    const isHr = emp?.designation?.name?.toLowerCase() === 'hr';
    return { isHr };
  }

  // ─── Team members with reviews (manager tab) ──────────────────────────────

  async getTeamMembersWithReviews(userId: string, orgId: string) {
    const managerEmp = await this.employeeRepo.findOne({
      where: { userId, organizationId: orgId },
      select: ['id'],
    });
    if (!managerEmp) return [];

    const teamMembers = await this.employeeRepo.find({
      where: { reportingTo: managerEmp.id, organizationId: orgId },
      select: ['id', 'userId', 'firstName', 'lastName', 'workEmail'],
      order: { firstName: 'ASC' },
    });

    return Promise.all(
      teamMembers.map(async (member) => {
        const [selfReview, managerReview] = await Promise.all([
          this.reviewRepo.findOne({
            where: { employee: { id: member.userId }, reviewType: 'SELF' },
            order: { createdAt: 'DESC' },
          }),
          this.reviewRepo.findOne({
            where: {
              employee: { id: member.userId },
              reviewer: { id: userId },
              reviewType: 'MANAGER',
            },
            order: { createdAt: 'DESC' },
          }),
        ]);
        return {
          employeeId: member.id,
          userId: member.userId,
          firstName: member.firstName,
          lastName: member.lastName,
          workEmail: member.workEmail,
          selfReview: selfReview
            ? {
                answers: selfReview.answers,
                overallRating: selfReview.overallRating,
                comments: selfReview.comments,
                submittedAt: selfReview.createdAt,
              }
            : null,
          managerReview: managerReview
            ? {
                id: managerReview.id,
                overallRating: managerReview.overallRating,
                comments: managerReview.comments,
                submittedAt: managerReview.createdAt,
              }
            : null,
        };
      }),
    );
  }

  // ─── All employees for HR view ────────────────────────────────────────────

  async getAllEmployeesForHrView(reviewerUserId: string, orgId: string) {
    // Scope to the HR's own branch; if no branch, show all org employees
    const hrEmp = await this.employeeRepo.findOne({
      where: { userId: reviewerUserId, organizationId: orgId },
      select: ['branchId'],
    });
    const whereClause: Record<string, string> = { organizationId: orgId };
    if (hrEmp?.branchId) {
      whereClause.branchId = hrEmp.branchId;
    }

    const employees = (await this.employeeRepo.find({
      where: whereClause,
      select: ['id', 'userId', 'firstName', 'lastName', 'workEmail'],
      order: { firstName: 'ASC' },
    })).filter((emp) => emp.userId !== reviewerUserId);

    return Promise.all(
      employees.map(async (emp) => {
        const [selfReview, hrReview] = await Promise.all([
          this.reviewRepo.findOne({
            where: { employee: { id: emp.userId }, reviewType: 'SELF' },
            order: { createdAt: 'DESC' },
          }),
          this.reviewRepo.findOne({
            where: {
              employee: { id: emp.userId },
              reviewer: { id: reviewerUserId },
              reviewType: 'HR',
            },
            order: { createdAt: 'DESC' },
          }),
        ]);
        return {
          employeeId: emp.id,
          userId: emp.userId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          workEmail: emp.workEmail,
          selfReview: selfReview
            ? {
                answers: selfReview.answers,
                overallRating: selfReview.overallRating,
                comments: selfReview.comments,
                submittedAt: selfReview.createdAt,
              }
            : null,
          hrReview: hrReview
            ? {
                id: hrReview.id,
                overallRating: hrReview.overallRating,
                comments: hrReview.comments,
                submittedAt: hrReview.createdAt,
              }
            : null,
        };
      }),
    );
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  async submitSelfReview(userId: string, dto: SubmitReviewDto) {
    if (dto.period) {
      const existing = await this.reviewRepo.findOne({
        where: { employee: { id: userId }, reviewType: 'SELF', period: dto.period },
      });
      if (existing) {
        existing.answers = dto.answers ?? existing.answers;
        existing.overallRating = dto.overallRating ?? existing.overallRating;
        existing.comments = dto.comments ?? existing.comments;
        return this.reviewRepo.save(existing);
      }
    }
    const review = this.reviewRepo.create({
      employee: { id: userId },
      reviewer: { id: userId },
      reviewType: 'SELF',
      period: dto.period,
      answers: dto.answers ?? [],
      overallRating: dto.overallRating,
      comments: dto.comments,
    });
    return this.reviewRepo.save(review);
  }

  async submitManagerReview(reviewerUserId: string, dto: SubmitReviewDto) {
    if (!dto.employeeId) throw new NotFoundException('employeeId required for manager review');
    const existing = await this.reviewRepo.findOne({
      where: {
        employee: { id: dto.employeeId },
        reviewer: { id: reviewerUserId },
        reviewType: 'MANAGER',
      },
    });
    if (existing) {
      existing.overallRating = dto.overallRating ?? existing.overallRating;
      existing.comments = dto.comments ?? existing.comments;
      existing.answers = dto.answers?.length ? dto.answers : existing.answers;
      existing.period = dto.period ?? existing.period;
      return this.reviewRepo.save(existing);
    }
    const review = this.reviewRepo.create({
      employee: { id: dto.employeeId },
      reviewer: { id: reviewerUserId },
      reviewType: 'MANAGER',
      period: dto.period,
      answers: dto.answers ?? [],
      overallRating: dto.overallRating,
      comments: dto.comments,
    });
    return this.reviewRepo.save(review);
  }

  async submitHrReview(reviewerUserId: string, dto: SubmitReviewDto) {
    if (!dto.employeeId) throw new NotFoundException('employeeId required for HR review');
    const existing = await this.reviewRepo.findOne({
      where: {
        employee: { id: dto.employeeId },
        reviewer: { id: reviewerUserId },
        reviewType: 'HR',
      },
    });
    if (existing) {
      existing.overallRating = dto.overallRating ?? existing.overallRating;
      existing.comments = dto.comments ?? existing.comments;
      existing.answers = dto.answers?.length ? dto.answers : existing.answers;
      existing.period = dto.period ?? existing.period;
      return this.reviewRepo.save(existing);
    }
    const review = this.reviewRepo.create({
      employee: { id: dto.employeeId },
      reviewer: { id: reviewerUserId },
      reviewType: 'HR',
      period: dto.period,
      answers: dto.answers ?? [],
      overallRating: dto.overallRating,
      comments: dto.comments,
    });
    return this.reviewRepo.save(review);
  }

  async getMyReviews(userId: string) {
    return this.reviewRepo.find({
      where: { employee: { id: userId } },
      order: { createdAt: 'DESC' },
      relations: ['reviewer'],
    });
  }

  async getTeamReviews(reviewerId: string) {
    return this.reviewRepo.find({
      where: { reviewer: { id: reviewerId }, reviewType: 'MANAGER' },
      order: { createdAt: 'DESC' },
      relations: ['employee'],
    });
  }

  // ─── Admin: aggregated view ───────────────────────────────────────────────

  async getAllReviewsAggregated(orgId: string) {
    const [employees, settings] = await Promise.all([
      this.employeeRepo.find({
        where: { organizationId: orgId },
        select: ['id', 'userId', 'firstName', 'lastName', 'workEmail'],
        order: { firstName: 'ASC' },
      }),
      this.getSettings(orgId),
    ]);

    return Promise.all(
      employees.map(async (emp) => {
        const [selfReview, managerReview, hrReview] = await Promise.all([
          this.reviewRepo.findOne({
            where: { employee: { id: emp.userId }, reviewType: 'SELF' },
            order: { createdAt: 'DESC' },
            relations: ['reviewer'],
          }),
          this.reviewRepo.findOne({
            where: { employee: { id: emp.userId }, reviewType: 'MANAGER' },
            order: { createdAt: 'DESC' },
            relations: ['reviewer'],
          }),
          this.reviewRepo.findOne({
            where: { employee: { id: emp.userId }, reviewType: 'HR' },
            order: { createdAt: 'DESC' },
            relations: ['reviewer'],
          }),
        ]);

        const ratings: number[] = [];
        if (selfReview?.overallRating != null) ratings.push(selfReview.overallRating);
        if (managerReview?.overallRating != null) ratings.push(managerReview.overallRating);
        if (hrReview?.overallRating != null) ratings.push(hrReview.overallRating);
        const overallRating =
          ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;

        return {
          employeeId: emp.id,
          userId: emp.userId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          workEmail: emp.workEmail,
          selfReview: selfReview
            ? {
                rating: selfReview.overallRating,
                remark: selfReview.comments,
                answers: selfReview.answers,
                submittedAt: selfReview.createdAt,
              }
            : null,
          managerReview: managerReview
            ? {
                rating: managerReview.overallRating,
                remark: managerReview.comments,
                reviewerEmail: managerReview.reviewer?.email,
                submittedAt: managerReview.createdAt,
              }
            : null,
          hrReview: hrReview
            ? {
                rating: hrReview.overallRating,
                remark: hrReview.comments,
                reviewerEmail: hrReview.reviewer?.email,
                submittedAt: hrReview.createdAt,
              }
            : null,
          overallRating,
          requireHrApproval: settings.requireHrApproval,
        };
      }),
    );
  }

  async getAllReviews(orgId: string) {
    return this.reviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.employee', 'employee')
      .leftJoinAndSelect('review.reviewer', 'reviewer')
      .where('employee.organizationId = :orgId', { orgId })
      .orderBy('review.createdAt', 'DESC')
      .getMany();
  }
}
