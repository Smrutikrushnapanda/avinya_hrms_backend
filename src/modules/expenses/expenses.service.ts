import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { CreateExpenseDto, UpdateExpenseStatusDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private expenseRepo: Repository<Expense>,
  ) {}

  async createExpense(userId: string, dto: CreateExpenseDto): Promise<Expense> {
    const expense = this.expenseRepo.create({
      userId,
      organizationId: dto.organizationId,
      category: dto.category,
      projectName: dto.projectName ?? null,
      title: dto.title,
      expenseDate: dto.expenseDate,
      expenseType: dto.expenseType,
      currency: dto.currency,
      amount: dto.amount,
      receiptUrl: dto.receiptUrl ?? null,
      status: 'PENDING',
    });
    return this.expenseRepo.save(expense);
  }

  async getMyExpenses(userId: string): Promise<Expense[]> {
    return this.expenseRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllExpenses(organizationId: string): Promise<Expense[]> {
    return this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .where('e.organization_id = :organizationId', { organizationId })
      .orderBy('e.createdAt', 'DESC')
      .getMany();
  }

  async updateStatus(id: string, dto: UpdateExpenseStatusDto): Promise<Expense> {
    const expense = await this.expenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    expense.status = dto.status;
    expense.adminRemarks = dto.adminRemarks ?? null;
    return this.expenseRepo.save(expense);
  }

  async deleteExpense(id: string, userId: string): Promise<void> {
    const expense = await this.expenseRepo.findOne({ where: { id, userId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.expenseRepo.delete(id);
  }
}
