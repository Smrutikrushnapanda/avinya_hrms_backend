import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '../entities/menu-item.entity';
import { PerformanceSettings } from '../../performance/entities/performance-settings.entity';
import { WfhRequest } from '../../wfh/entities/wfh-request.entity';

@Injectable()
export class MenuItemService {
  constructor(
    @InjectRepository(MenuItem)
    private repo: Repository<MenuItem>,
    @InjectRepository(PerformanceSettings)
    private perfSettingsRepo: Repository<PerformanceSettings>,
    @InjectRepository(WfhRequest)
    private wfhRequestRepo: Repository<WfhRequest>,
  ) {}

  async findAll(
    role?: string,
    planType?: string,
    userId?: string,
    organizationId?: string,
  ): Promise<MenuItem[]> {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.children', 'children')
      .where('m.is_active = :active', { active: true })
      .andWhere('m.parent_id IS NULL')
      .orderBy('m.sort_order', 'ASC')
      .addOrderBy('children.sort_order', 'ASC');

    if (role) {
      qb.andWhere('m.roles ? :role', { role });
      qb.andWhere('(children.id IS NULL OR children.roles ? :role2)', {
        role2: role,
      });
    }

    if (planType) {
      qb.andWhere('m.plan_tiers ? :planTypeVal', { planTypeVal: planType });
      qb.andWhere(
        '(children.id IS NULL OR children.plan_tiers ? :planTypeVal2)',
        { planTypeVal2: planType },
      );
    }

    const items = await qb.getMany();

    if (!items.length) {
      return [];
    }

    let perfEnabled: PerformanceSettings | null = null;
    if (organizationId) {
      perfEnabled = await this.perfSettingsRepo
        .createQueryBuilder('ps')
        .where('ps.organization_id = :orgId', { orgId: organizationId })
        .getOne();
    }

    const today = new Date().toISOString().split('T')[0];
    let hasApprovedWfh: WfhRequest | null = null;
    if (userId) {
      hasApprovedWfh = await this.wfhRequestRepo
        .createQueryBuilder('wr')
        .where('wr.user_id = :userId', { userId })
        .andWhere('wr.date <= :today', { today })
        .andWhere('(wr.end_date IS NULL OR wr.end_date >= :today)', { today })
        .andWhere('wr.status = :status', { status: 'APPROVED' })
        .getOne();
    }

    function passesCondition(item: MenuItem): boolean {
      if (!item.condition) return true;
      if (item.condition === 'performance_enabled') {
        return !!perfEnabled?.isEnabled;
      }
      if (item.condition === 'wfh_approved_today') {
        return !!hasApprovedWfh;
      }
      return true;
    }

    function filterItem(item: MenuItem): boolean {
      if (!passesCondition(item)) return false;
      if (item.children?.length) {
        item.children = item.children.filter(passesCondition);
        return item.children.length > 0;
      }
      return true;
    }

    return items.filter(filterItem);
  }
}
