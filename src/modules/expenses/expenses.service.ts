import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { Employee } from '../employee/entities/employee.entity';
import {
  CreateExpenseDto,
  UpdateExpenseStatusDto,
} from './dto/create-expense.dto';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

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

  async exportExpensesExcel(
    organizationId: string,
    status?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    let query = this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .where('e.organization_id = :organizationId', { organizationId })
      .orderBy('e.createdAt', 'DESC');

    if (status && status.toLowerCase() !== 'all') {
      query = query.andWhere('LOWER(e.status) = :status', {
        status: status.toLowerCase(),
      });
    }

    const expenses = await query.getMany();
    await this.overlayEmployeeNames(expenses.map((e) => e.user));

    const rows = expenses.map((exp, index) => {
      let employeeName = 'Employee';
      if (exp.user) {
        const parts = [exp.user.firstName, exp.user.middleName, exp.user.lastName].filter(Boolean);
        employeeName = parts.length ? parts.join(' ') : exp.user.email || 'Employee';
      }

      let formattedDate = '-';
      try {
        if (exp.expenseDate) {
          formattedDate = format(new Date(exp.expenseDate), 'yyyy-MM-dd');
        }
      } catch {
        formattedDate = String(exp.expenseDate || '-');
      }

      let formattedCreated = '-';
      try {
        if (exp.createdAt) {
          formattedCreated = format(new Date(exp.createdAt), 'yyyy-MM-dd HH:mm');
        }
      } catch {
        formattedCreated = String(exp.createdAt || '-');
      }

      return {
        'Sl#': index + 1,
        'Employee Name': employeeName,
        'Employee Email': exp.user?.email || '-',
        'Title': exp.title || '-',
        'Category': exp.category || '-',
        'Expense Type': exp.expenseType || '-',
        'Project Name': exp.projectName || '-',
        'Expense Date': formattedDate,
        'Currency': exp.currency || 'INR',
        'Amount': Number(exp.amount) || 0,
        'Status': exp.status || 'PENDING',
        'Admin Remarks': exp.adminRemarks || '-',
        'Receipt URL': exp.receiptUrl || '-',
        'Created At': formattedCreated,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 26 },
      { wch: 25 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 25 },
      { wch: 35 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    const sheetName =
      status && status.toLowerCase() !== 'all'
        ? `Expenses_${status.toUpperCase()}`.slice(0, 31)
        : 'All_Expenses';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const statusSuffix =
      status && status.toLowerCase() !== 'all'
        ? `_${status.toLowerCase()}`
        : '_all';
    const filename = `Expense_Claims${statusSuffix}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

    return { buffer, filename };
  }
}
