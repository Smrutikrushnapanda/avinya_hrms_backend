import { Controller, Get, UseGuards, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../employee/department.service';
import { DesignationService } from '../employee/designation.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly departmentService: DepartmentService,
    private readonly designationService: DesignationService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get consolidated HR dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Returns all dashboard data in single response',
  })
  async getDashboardSummary(@GetUser() user: User) {
    const organizationId = user.organizationId;

    try {
      const [
        dashboardStats,
        employees,
        departments,
        designations,
        departmentStats,
        upcomingBirthdays
      ] = await Promise.all([
        this.employeeService.getDashboardStats(organizationId),
        this.employeeService.findAll(organizationId),
        this.departmentService.findAll(organizationId),
        this.designationService.findAll(organizationId),
        this.departmentService.getStatistics(organizationId),
        this.employeeService.getUpcomingBirthdays(organizationId, 30),
      ]);

      return {
        success: true,
        data: {
          dashboardStats,
          employees,
          departments,
          designations,
          departmentStats,
          upcomingBirthdays,
        },
      };
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      return {
        success: false,
        error: 'Failed to fetch dashboard data',
        data: {
          dashboardStats: null,
          employees: [],
          departments: [],
          designations: [],
          departmentStats: [],
          upcomingBirthdays: [],
        },
      };
    }
  }

  // NEW: Comprehensive Employee Management API
  @Get('employees')
  @ApiOperation({ summary: 'Get comprehensive employee management data with pagination and filtering' })
  @ApiQuery({ name: 'page', type: 'number', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', type: 'number', required: false, description: 'Items per page (default: 15)' })
  @ApiQuery({ name: 'search', type: 'string', required: false, description: 'Search term for name, email, or employee code' })
  @ApiQuery({ name: 'status', type: 'string', required: false, description: 'Filter by status (all, active, inactive, terminated)' })
  @ApiQuery({ name: 'department', type: 'string', required: false, description: 'Filter by department ID' })
  @ApiQuery({ name: 'designation', type: 'string', required: false, description: 'Filter by designation ID' })
  @ApiQuery({ name: 'branch', type: 'string', required: false, description: 'Filter by branch ID' })
  @ApiQuery({ name: 'joinDateFilter', type: 'string', required: false, description: 'Filter by join date (all, last30, last90, thisYear)' })
  @ApiQuery({ name: 'sortBy', type: 'string', required: false, description: 'Sort field (default: firstName)' })
  @ApiQuery({ name: 'sortOrder', type: 'string', required: false, description: 'Sort order (asc, desc)' })
  @ApiResponse({
    status: 200,
    description: 'Returns comprehensive employee management data',
  })
  async getEmployeeManagementData(
    @GetUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('designation') designation?: string,
    @Query('branch') branch?: string,
    @Query('joinDateFilter') joinDateFilter?: string,
    @Query('sortBy', new DefaultValuePipe('firstName')) sortBy?: string,
    @Query('sortOrder', new DefaultValuePipe('asc')) sortOrder?: 'asc' | 'desc',
  ) {
    const organizationId = user.organizationId;
    const filters = {
      page,
      limit,
      search: search?.trim() || '',
      status: status || 'all',
      department: department || 'all',
      designation: designation || 'all',
      branch: branch || 'all',
      joinDateFilter: joinDateFilter || 'all',
      sortBy: sortBy || 'firstName',
      sortOrder: sortOrder || 'asc',
    };

    try {
      const [
        employeeData,
        departments,
        designations,
        dashboardStats,
        managers,
        recentJoiners,
        branches,
      ] = await Promise.all([
        this.employeeService.findAllWithFilters(organizationId, filters),
        this.departmentService.findAll(organizationId),
        this.designationService.findAll(organizationId),
        this.employeeService.getDashboardStats(organizationId),
        this.employeeService.findManagers(organizationId),
        this.employeeService.getRecentJoiners(organizationId, 30),
        this.employeeService.getBranchesForOrg(organizationId),
      ]);

      return {
        success: true,
        data: {
          employees: employeeData.employees,
          pagination: employeeData.pagination,
          filters: {
            departments,
            designations,
            managers,
            branches,
            appliedFilters: filters,
          },
          summary: {
            dashboardStats,
            recentJoiners,
            totalFiltered: employeeData.pagination.total,
          },
        },
      };
    } catch (error) {
      console.error('Error fetching employee management data:', error);
      return {
        success: false,
        error: 'Failed to fetch employee management data',
        data: {
          employees: [],
          pagination: {
            page: 1,
            limit: 15,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
          filters: {
            departments: [],
            designations: [],
            managers: [],
            appliedFilters: filters,
          },
          summary: {
            dashboardStats: null,
            recentJoiners: [],
            totalFiltered: 0,
          },
        },
      };
    }
  }
}
