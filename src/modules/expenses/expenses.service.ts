import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { Employee } from '../employee/entities/employee.entity';
import {
  CreateExpenseDto,
  UpdateExpenseStatusDto,
} from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private expenseRepo: Repository<Expense>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
  ) {}

  /**
   * `users.firstName/lastName` is the raw login identity and is often left
   * at its account-creation default (e.g. "Admin" for accounts created via
   * an admin invite). The `employees` table (HR profile, kept up to date
   * via the Employees admin form) is the accurate name source. Overlay it
   * onto each already-loaded `user` relation in place so the admin
   * expenses table shows the real employee name.
   */
  private async overlayEmployeeNames(
    users: Array<
      | {
          id: string;
          firstName?: string;
          middleName?: string;
          lastName?: string;
        }
      | null
      | undefined
    >,
  ): Promise<void> {
    const userIds = [
      ...new Set(
        users
          .filter(
            (
              u,
            ): u is {
              id: string;
              firstName?: string;
              middleName?: string;
              lastName?: string;
            } => !!u,
          )
          .map((u) => u.id),
      ),
    ];
    if (userIds.length === 0) return;

    const employees = await this.employeeRepo
      .createQueryBuilder('employee')
      .where('employee.userId IN (:...userIds)', { userIds })
      .select([
        'employee.userId',
        'employee.firstName',
        'employee.middleName',
        'employee.lastName',
      ])
      .getMany();

    const nameByUserId = new Map(
      employees
        .filter((e) => e.firstName)
        .map((e) => [
          e.userId,
          {
            firstName: e.firstName,
            middleName: e.middleName,
            lastName: e.lastName,
          },
        ]),
    );

    for (const user of users) {
      if (!user) continue;
      const resolved = nameByUserId.get(user.id);
      if (resolved) {
        user.firstName = resolved.firstName;
        user.middleName = resolved.middleName;
        user.lastName = resolved.lastName;
      }
    }
  }

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
    const expenses = await this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .where('e.organization_id = :organizationId', { organizationId })
      .orderBy('e.createdAt', 'DESC')
      .getMany();
    await this.overlayEmployeeNames(expenses.map((e) => e.user));
    return expenses;
  }

  async updateStatus(
    id: string,
    dto: UpdateExpenseStatusDto,
  ): Promise<Expense> {
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
