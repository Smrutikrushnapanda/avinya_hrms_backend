import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ValidateEmployeeDto } from './dto/validate-employee.dto';
import {
  CreateEmployeeAssetDto,
  UpdateEmployeeAssetDto,
  ReturnAssetDto,
} from './dto/employee-asset.dto';
import { CreateEmployeeDocumentDto } from './dto/employee-document.dto';
import {
  CreateDocumentTemplateDto,
  UpdateDocumentTemplateDto,
  PreviewLetterDto,
} from './dto/employee-document-template.dto';
import { DocumentTemplateType } from './entities/employee-document-template.entity';
import {
  SaveSettlementDto,
  AssignManagerDto,
} from './dto/employee-settlement.dto';
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
  @ApiQuery({
    name: 'status',
    type: 'string',
    required: false,
    description: 'active | inactive | all (default: active)',
  })
  findAll(
    @Query('organizationId') organizationId: string,
    @Query('status') status: string | undefined,
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, organizationId);
    return this.employeeService.findAll(organizationId, status);
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

  // --- DOCUMENT TEMPLATES ---
  @Get('document-templates')
  @ApiOperation({ summary: 'Get all document templates for organization' })
  async getDocumentTemplates(@GetUser() actor: User) {
    return this.employeeService.getDocumentTemplates(actor.organizationId);
  }

  @Get('document-templates/:type')
  @ApiOperation({ summary: 'Get document template by type for organization' })
  async getDocumentTemplateByType(
    @Param('type') type: DocumentTemplateType,
    @GetUser() actor: User,
  ) {
    return this.employeeService.getDocumentTemplateByType(
      actor.organizationId,
      type,
    );
  }

  @Post('document-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create or save document template' })
  async saveDocumentTemplate(
    @Body() dto: CreateDocumentTemplateDto,
    @GetUser() actor: User,
  ) {
    return this.employeeService.saveDocumentTemplate(
      actor.organizationId,
      dto,
      actor.id,
    );
  }

  @Put('document-templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update document template' })
  async updateDocumentTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTemplateDto,
    @GetUser() actor: User,
  ) {
    return this.employeeService.updateDocumentTemplate(
      actor.organizationId,
      id,
      dto,
      actor.id,
    );
  }

  @Post('document-templates/reset-default')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Reset document template to system default' })
  async resetDocumentTemplate(
    @Body('templateType') type: DocumentTemplateType,
    @GetUser() actor: User,
  ) {
    return this.employeeService.resetDocumentTemplate(
      actor.organizationId,
      type,
      actor.id,
    );
  }

  // --- PROJECT ASSIGNMENTS & MANAGERS ---
  @Get(':id/projects')
  @ApiOperation({ summary: 'Get all project assignments and managers for an employee' })
  @ApiParam({ name: 'id', type: 'string' })
  async getEmployeeProjects(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getProjectAssignments(
      employee.organizationId,
      id,
    );
  }

  @Post(':id/projects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Assign a project and manager to an employee' })
  @ApiParam({ name: 'id', type: 'string' })
  async assignProject(
    @Param('id') id: string,
    @Body()
    dto: {
      projectId: string;
      projectSource?: 'internal' | 'client';
      managerId?: string;
      role?: string;
    },
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.assignProject(
      employee.organizationId,
      id,
      dto,
    );
  }

  @Put(':id/projects/:assignmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update project assignment or manager for an employee' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'assignmentId', type: 'string' })
  async updateProjectAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body()
    dto: {
      projectId?: string;
      projectSource?: 'internal' | 'client';
      managerId?: string | null;
      role?: string;
    },
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.updateProjectAssignment(
      employee.organizationId,
      id,
      assignmentId,
      dto,
    );
  }

  @Delete(':id/projects/:assignmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Remove a project assignment for an employee' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiParam({ name: 'assignmentId', type: 'string' })
  async removeProjectAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.removeProjectAssignment(
      employee.organizationId,
      id,
      assignmentId,
    );
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

  // --- MANAGERS ---
  @Get(':id/managers')
  @ApiOperation({ summary: 'Get all managers for an employee' })
  async getEmployeeManagers(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getEmployeeManagers(employee.organizationId, id);
  }

  @Post(':id/managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Assign a manager to an employee' })
  async assignManager(
    @Param('id') id: string,
    @Body() dto: AssignManagerDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.assignManager(employee.organizationId, id, dto);
  }

  @Delete(':id/managers/:managerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Remove a manager assignment from an employee' })
  async removeManager(
    @Param('id') id: string,
    @Param('managerId') managerId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.removeManager(employee.organizationId, id, managerId);
  }

  @Patch(':id/primary-manager/:managerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Set primary manager for an employee' })
  async setPrimaryManager(
    @Param('id') id: string,
    @Param('managerId') managerId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.setPrimaryManager(employee.organizationId, id, managerId);
  }

  // --- PROJECT ASSIGNMENTS ---
  @Get(':id/project-assignments')
  @ApiOperation({ summary: 'Get all project assignments for an employee' })
  async getEmployeeProjectAssignments(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getProjectAssignments(employee.organizationId, id);
  }

  @Post(':id/project-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Assign employee to a project' })
  async assignEmployeeProjectAssignment(
    @Param('id') id: string,
    @Body() dto: any,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.assignProject(employee.organizationId, id, dto);
  }

  @Patch(':id/project-assignments/:assignmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update project assignment' })
  async updateEmployeeProjectAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: any,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.updateProjectAssignment(employee.organizationId, id, assignmentId, dto);
  }

  @Delete(':id/project-assignments/:assignmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Remove project assignment' })
  async removeEmployeeProjectAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.removeProjectAssignment(employee.organizationId, id, assignmentId);
  }

  // --- ASSETS & CLEARANCE ---
  @Get(':id/assets')
  @ApiOperation({ summary: 'Get employee assets' })
  async getAssets(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getEmployeeAssets(employee.organizationId, id);
  }

  @Post(':id/assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Assign asset to employee' })
  async createAsset(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeAssetDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.createEmployeeAsset(employee.organizationId, id, dto, actor.id);
  }

  @Patch(':id/assets/:assetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update employee asset' })
  async updateAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateEmployeeAssetDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.updateEmployeeAsset(employee.organizationId, id, assetId, dto);
  }

  @Post(':id/assets/:assetId/return')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Mark employee asset as returned' })
  async returnAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() dto: ReturnAssetDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.returnEmployeeAsset(employee.organizationId, id, assetId, dto);
  }

  @Delete(':id/assets/:assetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete employee asset' })
  async deleteAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.deleteEmployeeAsset(employee.organizationId, id, assetId);
  }

  @Get(':id/clearance')
  @ApiOperation({ summary: 'Get employee exit clearance status' })
  async getClearance(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getEmployeeClearance(employee.organizationId, id);
  }

  // --- DOCUMENTS ---
  @Get(':id/documents')
  @ApiOperation({ summary: 'Get employee documents' })
  async getDocuments(
    @Param('id') id: string,
    @Query('category') category: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getEmployeeDocuments(employee.organizationId, id, category);
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create employee document' })
  async createDocument(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDocumentDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.createEmployeeDocument(employee.organizationId, id, dto, actor.id);
  }

  @Delete(':id/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete employee document' })
  async deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.deleteEmployeeDocument(employee.organizationId, id, documentId);
  }

  // --- FULL & FINAL SETTLEMENT ---
  @Get(':id/final-settlement')
  @ApiOperation({ summary: 'Get or calculate full and final settlement' })
  async getSettlement(@Param('id') id: string, @GetUser() actor: User) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.getEmployeeSettlement(employee.organizationId, id);
  }

  @Post(':id/final-settlement')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Save/finalize full and final settlement' })
  async saveSettlement(
    @Param('id') id: string,
    @Body() dto: SaveSettlementDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.saveEmployeeSettlement(employee.organizationId, id, dto, actor.id);
  }

  @Get(':id/final-settlement/pdf')
  @ApiOperation({ summary: 'Download final settlement statement PDF' })
  async downloadSettlementPdf(
    @Param('id') id: string,
    @GetUser() actor: User,
    @Res() res: any,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    const pdfBuffer = await this.employeeService.generateSettlementPdf(employee.organizationId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Settlement-Statement-${employee.employeeCode || employee.id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  }

  // --- EMPLOYEE LETTERS (EXPERIENCE & RELIEVING) ---
  @Post(':id/letters/preview')
  @ApiOperation({ summary: 'Preview experience or relieving letter for employee' })
  async previewLetter(
    @Param('id') id: string,
    @Body() dto: PreviewLetterDto,
    @GetUser() actor: User,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    return this.employeeService.previewLetter(
      employee.organizationId,
      id,
      dto,
    );
  }

  @Get(':id/letters/:type/pdf')
  @ApiOperation({ summary: 'Download experience or relieving letter PDF for employee' })
  async downloadLetterPdf(
    @Param('id') id: string,
    @Param('type') type: DocumentTemplateType,
    @Query('customContent') customContent: string,
    @GetUser() actor: User,
    @Res() res: any,
  ) {
    const employee = await this.employeeService.findOne(id);
    this.assertSameOrg(actor, employee?.organizationId);
    const pdfBuffer = await this.employeeService.generateLetterPdf(
      employee.organizationId,
      id,
      type,
      customContent,
    );
    const docName =
      type === DocumentTemplateType.EXPERIENCE_LETTER
        ? 'Experience-Certificate'
        : 'Relieving-Letter';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${docName}-${employee.employeeCode || employee.id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  }
}
