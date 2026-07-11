import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notice } from './entities/notice.entity';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepo: Repository<Notice>,
  ) {}

  /**
   * Get the currently active notice for app load, scoped to the caller's
   * organization and visible only if one of the caller's roles is targeted.
   */
  async getActiveNotice(
    organizationId: string,
    roles: string[],
  ): Promise<Notice | null> {
    const now = new Date();
    const candidates = await this.noticeRepo
      .createQueryBuilder('notice')
      .leftJoinAndSelect('notice.meeting', 'meeting')
      .where('notice.organizationId = :organizationId', { organizationId })
      .andWhere('notice.start_at <= :now', { now })
      .andWhere('notice.end_at >= :now', { now })
      .orderBy('notice.start_at', 'DESC')
      .getMany();

    return (
      candidates.find((notice) =>
        notice.targetRoles.some((role) => roles.includes(role)),
      ) ?? null
    );
  }

  async createNotice(
    organizationId: string,
    dto: CreateNoticeDto,
  ): Promise<Notice> {
    const notice = this.noticeRepo.create({
      ...dto,
      organizationId,
      targetRoles: dto.targetRoles ?? ['ADMIN', 'HR', 'EMPLOYEE'],
      start_at: new Date(dto.start_at),
      end_at: new Date(dto.end_at),
    });
    return this.noticeRepo.save(notice);
  }

  async updateNotice(
    id: string,
    organizationId: string,
    dto: UpdateNoticeDto,
  ): Promise<Notice> {
    const notice = await this.findOwnedNotice(id, organizationId);
    Object.assign(notice, {
      ...dto,
      start_at: dto.start_at ? new Date(dto.start_at) : notice.start_at,
      end_at: dto.end_at ? new Date(dto.end_at) : notice.end_at,
    });
    return this.noticeRepo.save(notice);
  }

  async deleteNotice(
    id: string,
    organizationId: string,
  ): Promise<{ message: string }> {
    await this.findOwnedNotice(id, organizationId);
    await this.noticeRepo.delete(id);
    return { message: 'Notice deleted successfully' };
  }

  /** All notices for the caller's organization (admin/HR management view). */
  async findAll(organizationId: string): Promise<Notice[]> {
    return this.noticeRepo.find({
      where: { organizationId },
      relations: ['meeting'],
      order: { created_at: 'DESC' },
    });
  }

  private async findOwnedNotice(
    id: string,
    organizationId: string,
  ): Promise<Notice> {
    const notice = await this.noticeRepo.findOne({ where: { id } });
    if (!notice) {
      throw new NotFoundException('Notice not found');
    }
    if (notice.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this notice');
    }
    return notice;
  }
}
