import { Controller, Post, Body, Put, Param, Get, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from '../services/organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto, ChangeCredentialsDto } from '../dto/organization.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  SwaggerCreateOrganization,
  SwaggerUpdateOrganization,
  SwaggerChangeCredentials,
  SwaggerDeleteOrganization,
  SwaggerFindAllOrganizations,
  SwaggerFindOneOrganization,
} from '../docs/organization.swagger';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @SwaggerCreateOrganization()
  create(@Body() body: CreateOrganizationDto) {
    return this.orgService.create(body, body.createdBy || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @SwaggerUpdateOrganization()
  update(@Param('id') id: string, @Body() body: UpdateOrganizationDto, @Request() req: any) {
    return this.orgService.update(id, body, req.user?.userId || body.updatedBy || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/credentials')
  @SwaggerChangeCredentials()
  changeCredentials(
    @Param('id') id: string,
    @Body() body: ChangeCredentialsDto,
    @Request() req: any,
  ) {
    return this.orgService.changeCredentials(id, req.user.userId, body);
  }

  @Delete(':id')
  @SwaggerDeleteOrganization()
  delete(@Param('id') id: string) {
    return this.orgService.delete(id);
  }

  @Get()
  @SwaggerFindAllOrganizations()
  findAll() {
    return this.orgService.findAll();
  }

  @Get(':id')
  @SwaggerFindOneOrganization()
  findOne(@Param('id') id: string) {
    return this.orgService.findOne(id);
  }
}
