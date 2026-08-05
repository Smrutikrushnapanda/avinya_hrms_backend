import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { AssignWorkService } from './assign-work.service';
import {
  CreateAssignWorkDto,
  UpdateWorkProgressDto,
  WorkSource,
} from './dto/create-assign-work.dto';

@ApiTags('Assign Work')
@ApiBearerAuth()
@Controller('assign-work')
@UseGuards(JwtAuthGuard)
export class AssignWorkController {
  constructor(private readonly assignWorkService: AssignWorkService) {}

  @Get('options')
  @ApiOperation({ summary: 'Projects + employees for the Assign Work form' })
  getOptions(@GetUser() user: JwtPayload) {
    return this.assignWorkService.getOptions(user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Assign work to an employee' })
  create(@GetUser() user: JwtPayload, @Body() dto: CreateAssignWorkDto) {
    return this.assignWorkService.create(user.userId, user.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All work assignments in the organization' })
  listAll(@GetUser() user: JwtPayload) {
    return this.assignWorkService.listAll(user.organizationId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Work assigned to me' })
  getMy(@GetUser() user: JwtPayload) {
    return this.assignWorkService.getMy(user.organizationId, user.userId);
  }

  @Get('assigned-by-me')
  @ApiOperation({ summary: 'Work assigned by me' })
  getByMe(@GetUser() user: JwtPayload) {
    return this.assignWorkService.getByMe(user.organizationId, user.userId);
  }

  @Put(':id/progress')
  @ApiOperation({ summary: 'Update status / progress / work report' })
  updateProgress(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWorkProgressDto,
  ) {
    return this.assignWorkService.updateProgress(
      user,
      user.organizationId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a work assignment' })
  remove(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('source') source?: string,
  ) {
    return this.assignWorkService.remove(
      user,
      user.organizationId,
      id,
      source === 'internal' ? WorkSource.INTERNAL : WorkSource.CLIENT,
    );
  }
}
