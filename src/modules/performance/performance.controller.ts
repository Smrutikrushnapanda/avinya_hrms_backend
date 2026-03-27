import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@RequireProPlan()
@Controller('performance')
@UseGuards(JwtAuthGuard)
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  // ─── Settings ─────────────────────────────────────────────────────────────

  @Get('settings')
  getSettings(@GetUser() user: JwtPayload) {
    return this.service.getSettings(user.organizationId);
  }

  @Post('settings/toggle')
  toggleEnabled(@GetUser() user: JwtPayload) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can toggle performance monitor');
    return this.service.toggleEnabled(user.organizationId);
  }

  @Patch('settings')
  updateSettings(@GetUser() user: JwtPayload, @Body() dto: UpdateSettingsDto) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can update settings');
    return this.service.updateSettings(user.organizationId, dto);
  }

  // ─── Questions ────────────────────────────────────────────────────────────

  @Get('questions')
  getQuestions(@GetUser() user: JwtPayload) {
    return this.service.getQuestions(user.organizationId);
  }

  @Post('questions')
  createQuestion(@GetUser() user: JwtPayload, @Body() dto: CreateQuestionDto) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can add questions');
    return this.service.createQuestion(user.organizationId, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string, @GetUser() user: JwtPayload) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can delete questions');
    return this.service.deleteQuestion(id, user.organizationId);
  }

  // ─── Manager check ────────────────────────────────────────────────────────

  @Get('is-manager')
  checkIsManager(@GetUser() user: JwtPayload) {
    return this.service.checkIsManager(user.userId, user.organizationId);
  }

  // ─── HR check (by designation) ────────────────────────────────────────────

  @Get('is-hr')
  checkIsHr(@GetUser() user: JwtPayload) {
    return this.service.checkIsHr(user.userId, user.organizationId);
  }

  // ─── Team members with reviews (manager tab) ──────────────────────────────

  @Get('team')
  getTeamWithReviews(@GetUser() user: JwtPayload) {
    return this.service.getTeamMembersWithReviews(user.userId, user.organizationId);
  }

  // ─── All employees for HR view ────────────────────────────────────────────

  @Get('employees')
  getAllEmployeesForHr(@GetUser() user: JwtPayload) {
    return this.service.getAllEmployeesForHrView(user.userId, user.organizationId);
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  @Post('reviews/self')
  submitSelf(@GetUser() user: JwtPayload, @Body() dto: SubmitReviewDto) {
    return this.service.submitSelfReview(user.userId, dto);
  }

  @Post('reviews/manager')
  async submitManagerReview(@GetUser() user: JwtPayload, @Body() dto: SubmitReviewDto) {
    const { isManager } = await this.service.checkIsManager(user.userId, user.organizationId);
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isManager && !isAdmin) throw new ForbiddenException('Only managers/admins can submit team reviews');
    return this.service.submitManagerReview(user.userId, dto);
  }

  @Post('reviews/hr')
  submitHrReview(@GetUser() user: JwtPayload, @Body() dto: SubmitReviewDto) {
    return this.service.submitHrReview(user.userId, dto);
  }

  @Get('reviews/me')
  getMyReviews(@GetUser() user: JwtPayload) {
    return this.service.getMyReviews(user.userId);
  }

  @Get('reviews/team')
  getTeamReviews(@GetUser() user: JwtPayload) {
    const allowed = user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
    if (!allowed) throw new ForbiddenException('Access denied');
    return this.service.getTeamReviews(user.userId);
  }

  @Get('reviews/all')
  getAllReviews(@GetUser() user: JwtPayload) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Access denied');
    return this.service.getAllReviews(user.organizationId);
  }

  @Get('reviews/all-aggregated')
  getAllReviewsAggregated(@GetUser() user: JwtPayload) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Access denied');
    return this.service.getAllReviewsAggregated(user.organizationId);
  }
}
