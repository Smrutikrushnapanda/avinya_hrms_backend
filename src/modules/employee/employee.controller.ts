import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ValidateEmployeeDto } from './dto/validate-employee.dto';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';

@ApiTags('Employees')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@UseInterceptors(CacheInterceptor)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  private assertSameOrg(actor: User, organizationId: string) {
    if (
      !(actor as any)?.roles?.some(
        (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
      ) &&
      actor?.organizationId &&
      actor.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'You can only access employees in your own organization.',
      );
    }
  }

  // --- NEW DASHBOARD ENDPOINT ---
  @Get('dashboard-stats')
  @CacheTTL(120) // 2 minutes cache for dashboard stats
  @ApiOperation({ summary: 'Get dashboard stats for the organization' })
  @ApiResponse({ status: 200, description: 'Return dashboard stats.' })
  async getDashboardStats(@GetUser() user: User) {
    try {
      return await this.employeeService.getDashboardStats(user.organizationId);
    } catch (error) {
      console.error(
        'getDashboardStats controller error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
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
  @ApiQuery({
    name: 'days',
    type: 'number',
    required: false,
    description: 'Days ahead to look (default: 30)',
  })
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
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, organizationId);
    const birthdays = await this.employeeService.getUpcomingBirthdays(
      organizationId,
      days,
    );
    return { data: birthdays };
  }
  //------------------------------------------------- old code
  @Get('hierarchy')
  @ApiOperation({ summary: 'Get employee hierarchy or direct reports' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiQuery({ name: 'employeeId', type: 'string', required: false })
  @ApiResponse({
    status: 200,
    description:
      'Return employee hierarchy with direct reports when employeeId is provided.',
  })
  async getHierarchy(
    @Query('organizationId') organizationId: string,
    @Query('employeeId') employeeId?: string,
    @GetUser() actor?: User,
  ) {
    if (actor) {
      this.assertSameOrg(actor, organizationId);
    }
    return this.employeeService.getEmployeeHierarchy(
      organizationId,
      employeeId,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create a new employee' })
  create(@Body() dto: CreateEmployeeDto, @GetUser() actor: User) {
    dto.organizationId = actor.organizationId;
    return this.employeeService.create(dto);
  }

  @Get()
  @CacheTTL(300) // 5 minutes cache for employee list
  @ApiOperation({ summary: 'Get all employees by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  findAll(
    @Query('organizationId') organizationId: string,
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, organizationId);
    return this.employeeService.findAll(organizationId);
  }

  @Get('selector')
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Lightweight employee selector with search and filters',
  })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiQuery({ name: 'search', type: 'string', required: false })
  @ApiQuery({ name: 'departmentId', type: 'string', required: false })
  @ApiQuery({ name: 'designationId', type: 'string', required: false })
  @ApiQuery({ name: 'limit', type: 'number', required: false })
  async getSelector(
    @Query('organizationId') organizationId: string,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('designationId') designationId?: string,
    @Query('limit') limit?: number,
    @GetUser() actor?: User,
  ) {
    this.assertSameOrg(actor, organizationId);
    return this.employeeService.getEmployeeSelector(organizationId, {
      search,
      departmentId,
      designationId,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get(':id')
  @CacheTTL(600) // 10 minutes cache for single employee
  @ApiOperation({ summary: 'Get employee by employee ID' })
  @ApiParam({ name: 'id', type: 'string' })
  async findOne(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return employee;
  }

  @Get('by-user/:userId')
  @CacheTTL(600) // 10 minutes cache for user lookup
  @ApiOperation({ summary: 'Get employee by user ID' })
  @ApiParam({ name: 'userId', type: 'string' })
  async findByUserId(@Param('userId') userId: string, @GetUser() actor: User) {
    const actorUserId = (actor as any)?.userId || actor?.id;
    const isPrivileged = (actor as any)?.roles?.some(
      (r: { roleName: string }) =>
        ['ADMIN', 'HR', 'SUPERADMIN', 'MANAGER'].includes(r.roleName),
    );
    if (!isPrivileged && actorUserId !== userId) {
      throw new ForbiddenException(
        'You can only access your own employee profile.',
      );
    }
    const employee = await this.employeeService.findByUserId(userId);
    this.assertSameOrg(actor, employee?.organizationId);
    return employee;
  }

  @Get('managers')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Get all potential managers for organization' })
  @ApiQuery({ name: 'organizationId', required: true })
  async getManagers(
    @Query('organizationId') organizationId: string,
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, organizationId);
    return this.employeeService.findManagers(organizationId);
  }

  @Post('validate')
  @ApiOperation({
    summary:
      'Validate employee data before create/update (manager assignment, duplicates, etc)',
  })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateEmployee(
    @Body() dto: ValidateEmployeeDto,
    @GetUser() actor: User,
  ) {
    if (!dto.organizationId) {
      return { isValid: false, errors: ['organizationId is required'] };
    }
    this.assertSameOrg(actor, dto.organizationId);
    const result = await this.employeeService.validateManagerAssignment(
      dto as {
        organizationId: string;
        employeeId?: string;
        reportingTo: string;
      },
    );
    return result;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update employee by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete employee by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  async remove(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.remove(id);
  }
}
