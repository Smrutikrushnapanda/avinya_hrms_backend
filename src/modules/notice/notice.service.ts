import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notice } from './entities/notice.entity';

@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepo: Repository<Notice>,
  ) {}

  /**
   * Get the currently active notice for app load
   */
  async getActiveNotice(): Promise<Notice | null> {
    const now = new Date();
    return this.noticeRepo
      .createQueryBuilder('notice')
      .where('notice.start_at <= :now', { now })
      .andWhere('notice.end_at >= :now', { now })
      .orderBy('notice.start_at', 'DESC')
      .limit(1)
      .getOne();
  }

  /**
   * Create a new notice
   */
  async createNotice(data: Partial<Notice>): Promise<Notice> {
    const notice = this.noticeRepo.create(data);
    return this.noticeRepo.save(notice);
  }

  /**
   * Get all notices
   */
  async findAll(): Promise<Notice[]> {
    return this.noticeRepo.find({ order: { created_at: 'DESC' } });
  }
}