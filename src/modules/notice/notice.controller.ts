import { Controller, Get, Post, Body } from '@nestjs/common';
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
   * Create a new notice
   */
  @Post()
  async createNotice(@Body() data: Partial<Notice>): Promise<Notice> {
    return this.noticeService.createNotice(data);
  }

  /**
   * List all notices
   */
  @Get()
  async findAll(): Promise<Notice[]> {
    return this.noticeService.findAll();
  }
}