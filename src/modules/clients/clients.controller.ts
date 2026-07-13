import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';

@ApiTags('Clients')
@ApiBearerAuth()
@RequireProPlan()
@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create client' })
  create(@GetUser() user: JwtPayload, @Body() dto: CreateClientDto) {
    return this.clientsService.create({
      ...dto,
      organizationId: user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List clients by organization' })
  findAll(@GetUser() user: JwtPayload) {
    return this.clientsService.findAll(user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update client' })
  update(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete client' })
  remove(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.clientsService.remove(id, user.organizationId);
  }
}
