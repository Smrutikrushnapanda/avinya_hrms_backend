import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { DepartmentService, DepartmentStatistics } from './department.service';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department-designation.dto';
import { organizationScope } from './organization-scope.util';

@ApiTags('Departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all departments by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
  ) {
    const departments = await this.departmentService.findAll(
      organizationScope(user, organizationId),
    );
    return { data: departments };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create a new department' })
  async create(@Body() data: CreateDepartmentDto, @GetUser() user: JwtPayload) {
    const department = await this.departmentService.create({
      ...data,
      organizationId: organizationScope(user, data.organizationId),
    });
    return { data: department };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update a department' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateDepartmentDto,
    @GetUser() user: JwtPayload,
  ) {
    const department = await this.departmentService.update(
      id,
      data,
      organizationScope(user, data.organizationId),
    );
    return { data: department };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete a department' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.departmentService.remove(id, organizationScope(user));
    return { message: 'Department deleted successfully' };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get department statistics with employee counts' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  async getStatistics(
    @GetUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
  ): Promise<{ data: DepartmentStatistics[] }> {
    const statistics = await this.departmentService.getStatistics(
      organizationScope(user, organizationId),
    );
    return { data: statistics };
  }
}
