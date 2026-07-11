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
import { NoticeService } from './notice.service';
import { Notice } from './entities/notice.entity';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';

@Controller('notices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  /**
   * Get the currently active notice for HRMS app load — scoped to the
   * caller's organization and their own roles only.
   */
  @Get('active')
  async getActiveNotice(@GetUser() user: JwtPayload): Promise<Notice | null> {
    return this.noticeService.getActiveNotice(
      user.organizationId,
      user.roles.map((r) => r.roleName),
    );
  }

  /**
   * Create a new notice (supports optional meetingId to link a meeting)
   */
  @Post()
  @Roles('ADMIN', 'HR')
  async createNotice(
    @GetUser() user: JwtPayload,
    @Body() dto: CreateNoticeDto,
  ): Promise<Notice> {
    return this.noticeService.createNotice(user.organizationId, dto);
  }

  /**
   * Update an existing notice
   */
  @Put(':id')
  @Roles('ADMIN', 'HR')
  async updateNotice(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
  ): Promise<Notice> {
    return this.noticeService.updateNotice(id, user.organizationId, dto);
  }

  /**
   * Delete a notice
   */
  @Delete(':id')
  @Roles('ADMIN', 'HR')
  async deleteNotice(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.noticeService.deleteNotice(id, user.organizationId);
  }

  /**
   * List all notices for the caller's organization (admin/HR management view)
   */
  @Get()
  @Roles('ADMIN', 'HR')
  async findAll(@GetUser() user: JwtPayload): Promise<Notice[]> {
    return this.noticeService.findAll(user.organizationId);
  }
}
