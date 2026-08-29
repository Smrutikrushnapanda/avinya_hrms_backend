import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalaryStructureService } from './salary-structure.service';
import {
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
} from './dto/salary-structure.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { Employee } from '../employee/entities/employee.entity';

@ApiTags('Salary Structure')
@RequireProPlan()
@Controller('salary-structures')
@UseGuards(JwtAuthGuard)
export class SalaryStructureController {
  constructor(
    private readonly salaryStructureService: SalaryStructureService,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  private actorId(actor: any): string {
    return actor?.userId || actor?.id || '';
  }

  private isPrivileged(actor: any): boolean {
    return !!actor?.roles?.some((r: { roleName: string }) =>
      ['ADMIN', 'HR', 'SUPERADMIN'].includes(r.roleName),
    );
  }

  private async resolveSelfEmployeeId(actor: any): Promise<string | null> {
    const userId = this.actorId(actor);
    if (!userId) return null;
    const employee = await this.employeeRepo.findOne({ where: { userId } });
    return employee?.id ?? null;
  }

  private async assertEmployeeAccess(
    employeeId: string,
    actor: any,
  ): Promise<void> {
    if (this.isPrivileged(actor)) return;
    const selfEmployeeId = await this.resolveSelfEmployeeId(actor);
    if (!selfEmployeeId || selfEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'You can only access your own salary structure.',
      );
    }
  }

  private getOrganizationId(actor: any): string {
    return actor?.organizationId || '';
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create salary structure for an employee' })
  async create(@Body() dto: CreateSalaryStructureDto, @GetUser() actor: any) {
    const organizationId = this.getOrganizationId(actor);
    if (!organizationId) {
      throw new ForbiddenException('Organization ID not found in token');
    }
    dto.organizationId = organizationId;
    return this.salaryStructureService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update salary structure' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryStructureDto,
    @GetUser() actor: any,
  ) {
    const structure = await this.salaryStructureService.findOne(id);
    const organizationId = this.getOrganizationId(actor);
    if (structure.organizationId !== organizationId) {
      throw new ForbiddenException(
        'You can only modify salary structures in your organization.',
      );
    }
    return this.salaryStructureService.update(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all salary structures for the organization' })
  findAll(@GetUser() actor: any) {
    const organizationId = this.getOrganizationId(actor);
    return this.salaryStructureService.findAll(organizationId);
  }

  @Get('employee/:employeeId/active')
  @ApiOperation({ summary: 'Get active salary structure for an employee' })
  async findActiveByEmployee(
    @Param('employeeId') employeeId: string,
    @GetUser() actor: any,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.salaryStructureService.findActiveByEmployee(employeeId);
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get all salary structures for an employee' })
  async findByEmployee(
    @Param('employeeId') employeeId: string,
    @GetUser() actor: any,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.salaryStructureService.findByEmployee(employeeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get salary structure by ID' })
  async findOne(@Param('id') id: string, @GetUser() actor: any) {
    const structure = await this.salaryStructureService.findOne(id);
    const organizationId = this.getOrganizationId(actor);
    if (structure.organizationId !== organizationId) {
      throw new ForbiddenException(
        'You can only view salary structures in your organization.',
      );
    }
    return structure;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete salary structure' })
  async remove(@Param('id') id: string, @GetUser() actor: any) {
    const structure = await this.salaryStructureService.findOne(id);
    const organizationId = this.getOrganizationId(actor);
    if (structure.organizationId !== organizationId) {
      throw new ForbiddenException(
        'You can only delete salary structures in your organization.',
      );
    }
    return this.salaryStructureService.remove(id);
  }
}
