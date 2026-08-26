import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyPolicy } from './entities/company-policy.entity';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @InjectRepository(CompanyPolicy)
    private policyRepo: Repository<CompanyPolicy>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserPushToken)
    private pushTokenRepo: Repository<UserPushToken>,
    private readonly firebaseService: FirebaseService,
  ) {}

  async create(orgId: string, userId: string, dto: CreatePolicyDto) {
    const policy = this.policyRepo.create({
      organization: { id: orgId },
      createdBy: { id: userId },
      title: dto.title,
      content: dto.content,
      category: dto.category,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.policyRepo.save(policy);
    this.notifyOrgEmployees(
      orgId,
      '📋 New Policy Added',
      `"${saved.title}" has been published. Tap to read it.`,
      'policy_created',
      saved.id,
    ).catch((err) => this.logger.error('Policy create push failed', err));
    return saved;
  }

  async findAll(orgId: string) {
    return this.policyRepo.find({
      where: { organization: { id: orgId }, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, orgId: string) {
    const policy = await this.policyRepo.findOne({
      where: { id, organization: { id: orgId } },
    });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async update(id: string, orgId: string, dto: Partial<CreatePolicyDto>) {
    const policy = await this.findOne(id, orgId);
    Object.assign(policy, dto);
    const saved = await this.policyRepo.save(policy);
    this.notifyOrgEmployees(
      orgId,
      '📋 Policy Updated',
      `"${saved.title}" has been updated. Tap to review the changes.`,
      'policy_updated',
      saved.id,
    ).catch((err) => this.logger.error('Policy update push failed', err));
    return saved;
  }

  async remove(id: string, orgId: string) {
    const policy = await this.findOne(id, orgId);
    policy.isActive = false;
    await this.policyRepo.save(policy);
    return { success: true };
  }

  /**
   * Sends a push notification to every user in the organisation.
   * Runs fire-and-forget — never throws so it can't break the HTTP response.
   * Invalid/expired tokens are cleaned up automatically.
   */
  private async notifyOrgEmployees(
    orgId: string,
    title: string,
    body: string,
    type: string,
    policyId: string,
  ): Promise<void> {
    // 1. Collect all user IDs that belong to this organisation.
    const users = await this.userRepo.find({
      where: { organizationId: orgId },
      select: ['id'],
    });
    if (!users.length) return;

    const userIds = users.map((u) => u.id);

    // 2. Fetch every registered push token for those users.
    const pushTokenRows = await this.pushTokenRepo.find({
      where: { userId: In(userIds) },
      select: ['token'],
    });
    const tokens = pushTokenRows.map((r) => r.token);
    if (!tokens.length) return;

    // 3. Send the push and clean up any permanently-invalid tokens.
    const { invalidTokens } = await this.firebaseService.sendToTokens(tokens, {
      title,
      body,
      data: { type, policyId },
    });
    if (invalidTokens.length) {
      await this.pushTokenRepo.delete({ token: In(invalidTokens) });
    }
  }
}
