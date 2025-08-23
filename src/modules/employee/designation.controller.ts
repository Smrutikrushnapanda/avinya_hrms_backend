import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
