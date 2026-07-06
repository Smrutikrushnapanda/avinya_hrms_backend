import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PolicyService } from './policy.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@RequireProPlan()
@Controller('policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PolicyController {
  constructor(private readonly service: PolicyService) {}

  @Get()
  findAll(@GetUser() user: JwtPayload) {
    return this.service.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  @Roles('ADMIN')
  create(@GetUser() user: JwtPayload, @Body() dto: CreatePolicyDto) {
    return this.service.create(user.organizationId, user.userId, dto);
  }

  @Put(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: Partial<CreatePolicyDto>,
  ) {
    return this.service.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.service.remove(id, user.organizationId);
  }
}
