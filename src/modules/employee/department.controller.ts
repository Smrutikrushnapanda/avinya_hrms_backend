import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { DepartmentService, DepartmentStatistics } from './department.service';

@ApiTags('Departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all departments by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  async findAll(@Query('organizationId') organizationId: string) {
    const departments = await this.departmentService.findAll(organizationId);
    return { data: departments };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new department' })
  async create(@Body() data: { name: string; code: string; organizationId: string }) {
    const department = await this.departmentService.create(data);
    return { data: department };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a department' })
  async update(@Param('id') id: string, @Body() data: { name?: string; code?: string }) {
    const department = await this.departmentService.update(id, data);
    return { data: department };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a department' })
  async remove(@Param('id') id: string) {
    await this.departmentService.remove(id);
    return { message: 'Department deleted successfully' };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get department statistics with employee counts' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  async getStatistics(@Query('organizationId') organizationId: string): Promise<{ data: DepartmentStatistics[] }> {
    const statistics = await this.departmentService.getStatistics(organizationId);
    return { data: statistics };
  }
}
