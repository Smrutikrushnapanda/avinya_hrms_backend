import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { NoticeService } from './notice.service';
import { Notice } from './entities/notice.entity';

@Controller('notices')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  /**
   * Get the currently active notice for HRMS app load
   */
  @Get('active')
  async getActiveNotice(): Promise<Notice | null> {
    return this.noticeService.getActiveNotice();
  }

  /**
   * Create a new notice (supports optional meetingId to link a meeting)
   */
  @Post()
  async createNotice(@Body() data: Partial<Notice>): Promise<Notice> {
    return this.noticeService.createNotice(data);
  }

  /**
   * Update an existing notice
   */
  @Put(':id')
  async updateNotice(
    @Param('id') id: string,
    @Body() data: Partial<Notice>,
  ): Promise<Notice> {
    return this.noticeService.updateNotice(id, data);
  }

  /**
   * Delete a notice
   */
  @Delete(':id')
  async deleteNotice(@Param('id') id: string): Promise<{ message: string }> {
    return this.noticeService.deleteNotice(id);
  }

  /**
   * List all notices
   */
  @Get()
  async findAll(): Promise<Notice[]> {
    return this.noticeService.findAll();
  }
}