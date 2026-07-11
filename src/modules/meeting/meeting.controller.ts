import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import {
  CreateMeetingDto,
  UpdateMeetingDto,
  UpdateMeetingStatusDto,
} from './dto/meeting.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@RequireProPlan()
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  private getUserId(user: Partial<User> & { userId?: string }) {
    return (user as any)?.userId || user?.id;
  }

  @Post()
  async createMeeting(@GetUser() user: User, @Body() dto: CreateMeetingDto) {
    const userId = this.getUserId(user);
    dto.createdById = userId;
    return this.meetingService.createMeeting(dto);
  }

  @Get('org/:organizationId')
  async getMeetingsByOrg(
    @GetUser() user: User,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.meetingService.getMeetingsByOrg(organizationId);
  }

  @Get('org/:organizationId/upcoming')
  async getUpcomingMeetingsByOrg(
    @GetUser() user: User,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.meetingService.getUpcomingMeetingsByOrg(organizationId);
  }

  @Get('user/:userId')
  async getMeetingsForUser(
    @GetUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const currentUserId = this.getUserId(user);
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only view your own meetings');
    }
    return this.meetingService.getMeetingsForUser(userId);
  }

  @Get('user/:userId/upcoming')
  async getUpcomingMeetingsForUser(
    @GetUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const currentUserId = this.getUserId(user);
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only view your own meetings');
    }
    return this.meetingService.getUpcomingMeetingsForUser(userId);
  }

  @Get(':id')
  async getMeetingById(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetingService.findMeetingById(id);
  }

  @Put(':id')
  async updateMeeting(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingService.updateMeeting(id, dto);
  }

  @Delete(':id')
  async deleteMeeting(@GetUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetingService.deleteMeeting(id);
  }

  @Post(':id/notify')
  async sendNotification(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.sendMeetingNotification(id);
  }

  @Put(':id/status')
  async updateStatus(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingStatusDto,
  ) {
    return this.meetingService.updateMeetingStatus(id, dto.status);
  }
}
