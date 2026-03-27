import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto, UpdateMeetingDto } from './dto/meeting.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@RequireProPlan()
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  async createMeeting(@Body() dto: CreateMeetingDto) {
    return this.meetingService.createMeeting(dto);
  }

  @Get('org/:organizationId')
  async getMeetingsByOrg(@Param('organizationId') organizationId: string) {
    return this.meetingService.getMeetingsByOrg(organizationId);
  }

  @Get('org/:organizationId/upcoming')
  async getUpcomingMeetingsByOrg(@Param('organizationId') organizationId: string) {
    return this.meetingService.getUpcomingMeetingsByOrg(organizationId);
  }

  @Get('user/:userId')
  async getMeetingsForUser(@Param('userId') userId: string) {
    return this.meetingService.getMeetingsForUser(userId);
  }

  @Get('user/:userId/upcoming')
  async getUpcomingMeetingsForUser(@Param('userId') userId: string) {
    return this.meetingService.getUpcomingMeetingsForUser(userId);
  }

  @Get(':id')
  async getMeetingById(@Param('id') id: string) {
    return this.meetingService.findMeetingById(id);
  }

  @Put(':id')
  async updateMeeting(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetingService.updateMeeting(id, dto);
  }

  @Delete(':id')
  async deleteMeeting(@Param('id') id: string) {
    return this.meetingService.deleteMeeting(id);
  }

  @Post(':id/notify')
  async sendNotification(@Param('id') id: string) {
    return this.meetingService.sendMeetingNotification(id);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.meetingService.updateMeetingStatus(id, status);
  }
}
