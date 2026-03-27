import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseStatusDto } from './dto/create-expense.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';

@ApiTags('Expenses')
@RequireProPlan()
@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Submit an expense' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async createExpense(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(userId, dto);
  }

  @Get('my/:userId')
  @ApiOperation({ summary: "Get employee's own expenses" })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getMyExpenses(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.expensesService.getMyExpenses(userId);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all expenses for an organization (admin)' })
  @ApiQuery({ name: 'organizationId', type: 'string' })
  async getAllExpenses(@Query('organizationId') organizationId: string) {
    return this.expensesService.getAllExpenses(organizationId);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Approve or reject an expense (admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.expensesService.updateStatus(id, dto);
  }

  @Delete(':id/:userId')
  @ApiOperation({ summary: 'Delete own expense' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.expensesService.deleteExpense(id, userId);
    return { message: 'Expense deleted' };
  }
}
