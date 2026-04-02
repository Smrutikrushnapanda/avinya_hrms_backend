import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards, // <-- 1. Import UseGuards
  UseInterceptors, // Import UseInterceptors from @nestjs/common
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ValidateEmployeeDto } from './dto/validate-employee.dto';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard'; // <-- 2. Import JwtAuthGuard
import { GetUser } from '../auth-core/decorators/get-user.decorator'; // <-- 3. Import GetUser decorator
import { User } from '../auth-core/entities/user.entity'; // <-- 4. Import User entity


@ApiTags('Employees')
@Controller('employees')
@UseInterceptors(CacheInterceptor) // Apply caching to all routes in this controller
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  // --- NEW DASHBOARD ENDPOINT ---
  @Get('dashboard-stats')
  @UseGuards(JwtAuthGuard)
  @CacheTTL(120) // 2 minutes cache for dashboard stats
  @ApiOperation({ summary: 'Get dashboard stats for the organization' })
  @ApiResponse({ status: 200, description: 'Return dashboard stats.' })
  async getDashboardStats(@GetUser() user: User) {
    try {
      return await this.employeeService.getDashboardStats(user.organizationId);
    } catch (error) {
      console.error('getDashboardStats controller error:', error instanceof Error ? error.message : 'Unknown error');
      return {
        totalEmployees: { value: 0, change: 0 },
        activeEmployees: { value: 0, change: 0 },
        presentToday: { value: 0, change: 0 },
        onLeaveToday: { value: 0, change: 0 },
        pendingLeaveRequests: { value: 0, change: 0 },
        newJoinersThisMonth: { value: 0, change: 0 },
        departments: { value: 0, change: 0 },
        designations: { value: 0, change: 0 },
        attendanceBreakdown: { present: 0, halfDay: 0, absent: 0 },
      };
    }
  }
  // -----------------------------

@Get('birthdays/upcoming')
@CacheTTL(3600) // 1 hour cache for birthdays (they don't change frequently)
@ApiOperation({ summary: 'Get upcoming employee birthdays' })
@ApiQuery({ name: 'organizationId', type: 'string', required: true })
@ApiQuery({ name: 'days', type: 'number', required: false, description: 'Days ahead to look (default: 30)' })
@ApiResponse({
  status: 200,
  description: 'Return upcoming birthdays',
  schema: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dateOfBirth: { type: 'string' },
            department: { type: 'object' },
            photoUrl: { type: 'string' },
            workEmail: { type: 'string' },
          },
        },
      },
    },
  },
})
async getUpcomingBirthdays(
  @Query('organizationId') organizationId: string,
  @Query('days') days: number = 30,
) {
  const birthdays = await this.employeeService.getUpcomingBirthdays(organizationId, days);
  return { data: birthdays };
}
//------------------------------------------------- old code
  @Get('hierarchy')
  @ApiOperation({ summary: 'Get employee hierarchy or direct reports' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiQuery({ name: 'employeeId', type: 'string', required: false })
  @ApiResponse({
    status: 200,
    description: 'Return employee hierarchy with direct reports when employeeId is provided.',
  })
  async getHierarchy(
    @Query('organizationId') organizationId: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.employeeService.getEmployeeHierarchy(organizationId, employeeId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @Get()
  @CacheTTL(300) // 5 minutes cache for employee list
  @ApiOperation({ summary: 'Get all employees by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  findAll(@Query('organizationId') organizationId: string) {
    return this.employeeService.findAll(organizationId);
  }

  @Get(':id')
  @CacheTTL(600) // 10 minutes cache for single employee
  @ApiOperation({ summary: 'Get employee by employee ID' })
  @ApiParam({ name: 'id', type: 'string' })
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

@Get('by-user/:userId')
  @CacheTTL(600) // 10 minutes cache for user lookup
  @ApiOperation({ summary: 'Get employee by user ID' })
  @ApiParam({ name: 'userId', type: 'string' })
  async findByUserId(@Param('userId') userId: string) {
    return this.employeeService.findByUserId(userId);
  }

  @Get('managers')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get all potential managers for organization' })
  @ApiQuery({ name: 'organizationId', required: true })
  async getManagers(@Query('organizationId') organizationId: string) {
    return this.employeeService.findManagers(organizationId);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate employee data before create/update (manager assignment, duplicates, etc)' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateEmployee(
    @Body() dto: ValidateEmployeeDto
  ) {
    if (!dto.organizationId) {
      return { isValid: false, errors: ['organizationId is required'] };
    }
    const result = await this.employeeService.validateManagerAssignment(dto as { organizationId: string; employeeId?: string; reportingTo: string });
    return result;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update employee by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete employee by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  remove(@Param('id') id: string) {
    return this.employeeService.remove(id);
  }
}
