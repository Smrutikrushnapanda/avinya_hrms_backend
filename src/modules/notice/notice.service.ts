import { Injectable, NotFoundException } from '@nestjs/common';
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
      .leftJoinAndSelect('notice.meeting', 'meeting')
      .where('notice.start_at <= :now', { now })
      .andWhere('notice.end_at >= :now', { now })
      .orderBy('notice.start_at', 'DESC')
      .limit(1)
      .getOne();
  }

  /**
   * Create a new notice (supports optional meetingId to link a meeting)
   */
  async createNotice(data: Partial<Notice>): Promise<Notice> {
    const notice = this.noticeRepo.create(data);
    return this.noticeRepo.save(notice);
  }

  /**
   * Update an existing notice
   */
  async updateNotice(id: string, data: Partial<Notice>): Promise<Notice> {
    const notice = await this.noticeRepo.findOne({ where: { id } });
    if (!notice) {
      throw new NotFoundException('Notice not found');
    }
    Object.assign(notice, data);
    return this.noticeRepo.save(notice);
  }

  /**
   * Delete a notice
   */
  async deleteNotice(id: string): Promise<{ message: string }> {
    const result = await this.noticeRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Notice not found');
    }
    return { message: 'Notice deleted successfully' };
  }

  /**
   * Get all notices (with linked meeting info)
   */
  async findAll(): Promise<Notice[]> {
    return this.noticeRepo.find({
      relations: ['meeting'],
      order: { created_at: 'DESC' },
    });
  }
}
