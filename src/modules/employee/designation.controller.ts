import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { DesignationService } from './designation.service';

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
  async findAll(@Query('organizationId') organizationId: string) {
    const designations = await this.designationService.findAll(organizationId);
    return { data: designations };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new designation' })
  async create(@Body() data: { name: string; code: string; organizationId: string }) {
    const designation = await this.designationService.create(data);
    return { data: designation };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a designation' })
  async update(@Param('id') id: string, @Body() data: { name?: string; code?: string }) {
    const designation = await this.designationService.update(id, data);
    return { data: designation };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a designation' })
  async remove(@Param('id') id: string) {
    await this.designationService.remove(id);
    return { message: 'Designation deleted successfully' };
  }
}
