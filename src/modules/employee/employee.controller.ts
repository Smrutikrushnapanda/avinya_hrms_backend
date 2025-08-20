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
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard'; // <-- 2. Import JwtAuthGuard
import { GetUser } from '../auth-core/decorators/get-user.decorator'; // <-- 3. Import GetUser decorator
import { User } from '../auth-core/entities/user.entity'; // <-- 4. Import User entity

@ApiTags('Employees')
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  // --- NEW DASHBOARD ENDPOINT ---
  @Get('dashboard-stats')
  @UseGuards(JwtAuthGuard) // Protect this endpoint
  @ApiOperation({ summary: 'Get dashboard stats for the organization' })
  @ApiResponse({ status: 200, description: 'Return dashboard stats.' })
  getDashboardStats(@GetUser() user: User) {
    // Get the organizationId from the authenticated user
    return this.employeeService.getDashboardStats(user.organizationId);
  }
  // -----------------------------

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  findAll(@Query('organizationId') organizationId: string) {
    return this.employeeService.findAll(organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by employee ID' })
  @ApiParam({ name: 'id', type: 'string' })
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Get employee by user ID' })
  @ApiParam({ name: 'userId', type: 'string' })
  async findByUserId(@Param('userId') userId: string) {
    return this.employeeService.findByUserId(userId);
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