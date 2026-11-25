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
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { DesignationService } from './designation.service';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import {
  CreateDesignationDto,
  UpdateDesignationDto,
} from './dto/department-designation.dto';
import { organizationScope } from './organization-scope.util';

@ApiTags('Designations')
@Controller('designations')
@UseGuards(JwtAuthGuard)
export class DesignationController {
  constructor(private readonly designationService: DesignationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all designations by organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiResponse({
    status: 200,
    description: 'Return all designations for organization',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              code: { type: 'string' },
              organizationId: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiQuery({ name: 'departmentId', type: 'string', required: false })
  async findAll(
    @GetUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('departmentId', new ParseUUIDPipe({ optional: true }))
    departmentId?: string,
  ) {
    const designations = await this.designationService.findAll(
      organizationScope(user, organizationId),
      departmentId,
    );
    return { data: designations };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create a new designation' })
  async create(
    @Body() data: CreateDesignationDto,
    @GetUser() user: JwtPayload,
  ) {
    const designation = await this.designationService.create({
      ...data,
      organizationId: organizationScope(user, data.organizationId),
    });
    return { data: designation };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update a designation' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateDesignationDto,
    @GetUser() user: JwtPayload,
  ) {
    const designation = await this.designationService.update(
      id,
      data,
      organizationScope(user, data.organizationId),
    );
    return { data: designation };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete a designation' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.designationService.remove(id, organizationScope(user));
    return { message: 'Designation deleted successfully' };
  }
}
