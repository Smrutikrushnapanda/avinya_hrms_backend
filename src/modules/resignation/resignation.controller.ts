import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ResignationService } from './resignation.service';
import {
  CreateResignationRequestDto,
  ReviewResignationRequestDto,
} from './dto/resignation.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';

@Controller('resignations')
@UseGuards(JwtAuthGuard)
export class ResignationController {
  constructor(private readonly resignationService: ResignationService) {}

  @Post('request')
  createRequest(@GetUser() user: any, @Body() dto: CreateResignationRequestDto) {
    return this.resignationService.createRequest(user, dto);
  }

  @Get('me')
  getMyRequests(@GetUser() user: any) {
    return this.resignationService.getMyRequests(user);
  }

  @Get('org')
  getOrgRequests(@GetUser() user: any, @Query('status') status?: string) {
    return this.resignationService.getOrgRequests(user, status);
  }

  @Patch(':id/review')
  reviewRequest(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() dto: ReviewResignationRequestDto,
  ) {
    return this.resignationService.reviewRequest(id, user, dto);
  }
}

