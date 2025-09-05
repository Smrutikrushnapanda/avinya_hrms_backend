import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { TimeslipService } from './timeslip.service';
import { CreateTimeslipDto } from './dto/create-timeslip.dto';
import { UpdateTimeslipDto } from './dto/update-timeslip.dto';
import { ApproveTimeslipDto } from './dto/approve-timeslip.dto';

@Controller('timeslips')
export class TimeslipController {
  constructor(private readonly timeslipService: TimeslipService) {}

  /** ---- Create a new timeslip ---- */
  @Post()
  create(@Body() dto: CreateTimeslipDto) {
    return this.timeslipService.createTimeslip(dto);
  }

  /** ---- Get all timeslips ---- */
  @Get()
  findAll() {
    return this.timeslipService.findAll();
  }

  /** ---- Get a single timeslip ---- */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeslipService.findOne(id);
  }

  /** ---- Update a timeslip (employee correction) ---- */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTimeslipDto) {
    return this.timeslipService.update(id, dto);
  }

  /** ---- Delete a timeslip ---- */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.timeslipService.remove(id);
  }

  /** ---- Approve / Reject timeslip ---- */
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveTimeslipDto) {
    return this.timeslipService.approve(id, dto);
  }
}
