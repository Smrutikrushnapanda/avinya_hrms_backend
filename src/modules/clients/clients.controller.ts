import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';

@ApiTags('Clients')
@ApiBearerAuth()
@RequireProPlan()
@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create client' })
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List clients by organization' })
  @ApiQuery({ name: 'organizationId', required: true, type: String })
  findAll(@Query('organizationId') organizationId: string) {
    return this.clientsService.findAll(organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update client' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete client' })
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
