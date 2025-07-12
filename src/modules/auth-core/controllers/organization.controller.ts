import { Controller, Post, Body, Put, Param, Get } from '@nestjs/common';
import { OrganizationService } from '../services/organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from '../dto/organization.dto';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  create(@Body() body: CreateOrganizationDto) {
    return this.orgService.create(body, body.createdBy || 'system');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateOrganizationDto) {
    return this.orgService.update(id, body, body.updatedBy || 'system');
  }

  @Get()
  findAll() {
    return this.orgService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orgService.findOne(id);
  }
}