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
import { PolicyService } from './policy.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';

@Controller('policy')
@UseGuards(JwtAuthGuard)
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
  create(@GetUser() user: JwtPayload, @Body() dto: CreatePolicyDto) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can create policies');
    return this.service.create(user.organizationId, user.userId, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: Partial<CreatePolicyDto>,
  ) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can update policies');
    return this.service.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN');
    if (!isAdmin) throw new ForbiddenException('Only admins can delete policies');
    return this.service.remove(id, user.organizationId);
  }
}
