import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Employees')
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

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