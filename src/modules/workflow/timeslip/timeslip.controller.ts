import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { TimeslipService } from './timeslip.service';
import { CreateTimeslipDto } from './dto/create-timeslip.dto';
import { UpdateTimeslipDto } from './dto/update-timeslip.dto';
import { ApproveTimeslipDto } from './dto/approve-timeslip.dto';
import { BatchUpdateTimeslipStatusDto } from './dto/batch-update-timeslip-status.dto';


@ApiTags('Timeslips')
@ApiBearerAuth() // remove if you don't use bearer auth
@Controller('timeslips')
export class TimeslipController {
  constructor(private readonly timeslipService: TimeslipService) { }

  /** ---- Create a new timeslip ---- */
  @Post()
  @ApiOperation({ summary: 'Create a new timeslip (employee correction request)' })
  @ApiCreatedResponse({ description: 'Timeslip created successfully.' })
  @ApiBadRequestResponse({ description: 'Invalid input.' })
  @ApiBody({ type: CreateTimeslipDto })
  create(@Body() dto: CreateTimeslipDto) {
    return this.timeslipService.createTimeslip(dto);
  }

  /** ---- Get all timeslips ---- */
  @Get()
  @ApiOperation({ summary: 'Get all timeslips' })
  @ApiOkResponse({ description: 'List of timeslips returned.' })
  findAll() {
    return this.timeslipService.findAll();
  }

  /** ---- Get timeslips for an employee (paginated) ---- */
  @Get('employee/:id')
  @ApiOperation({ summary: 'Get timeslips for a specific employee (paginated)' })
  @ApiParam({ name: 'id', description: 'Employee id (UUID)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiOkResponse({ description: 'Paginated timeslips for the employee.' })
  async findByEmployee(
    @Param('id') employeeId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    const maxLimit = 100;
    if (limit > maxLimit) limit = maxLimit;

    return this.timeslipService.findByEmployee(employeeId, page, limit);
  }

  /** ---- Get a single timeslip ---- */
  @Get(':id')
  @ApiOperation({ summary: 'Get a timeslip by id' })
  @ApiParam({ name: 'id', description: 'Timeslip id (UUID)' })
  @ApiOkResponse({ description: 'Timeslip returned.' })
  @ApiNotFoundResponse({ description: 'Timeslip not found.' })
  findOne(@Param('id') id: string) {
    return this.timeslipService.findOne(id);
  }

  /** ---- Update a timeslip (employee correction) ---- */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a timeslip (employee update)' })
  @ApiParam({ name: 'id', description: 'Timeslip id (UUID)' })
  @ApiBody({ type: UpdateTimeslipDto })
  @ApiOkResponse({ description: 'Timeslip updated successfully.' })
  @ApiBadRequestResponse({ description: 'Invalid update payload.' })
  update(@Param('id') id: string, @Body() dto: UpdateTimeslipDto) {
    return this.timeslipService.update(id, dto);
  }

  /** ---- Delete a timeslip ---- */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a timeslip' })
  @ApiParam({ name: 'id', description: 'Timeslip id (UUID)' })
  @ApiOkResponse({ description: 'Timeslip deleted successfully.' })
  @ApiNotFoundResponse({ description: 'Timeslip not found.' })
  remove(@Param('id') id: string) {
    return this.timeslipService.remove(id);
  }

  /** ---- Approve / Reject timeslip ---- */
  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve or reject a timeslip (action by approver)' })
  @ApiParam({ name: 'id', description: 'Timeslip id (UUID)' })
  @ApiBody({ type: ApproveTimeslipDto })
  @ApiOkResponse({ description: 'Timeslip approval action recorded.' })
  @ApiBadRequestResponse({ description: 'Invalid approval payload.' })
  approve(@Param('id') id: string, @Body() dto: ApproveTimeslipDto) {
    return this.timeslipService.approve(id, dto);
  }

  //New Api
  @Post('batch-update-status')
  @ApiOperation({
    summary: 'Batch update statuses of multiple timeslips',
    description: 'Update the status of multiple timeslips in a single request'
  })
  @ApiCreatedResponse({
    description: 'Timeslip statuses updated successfully',
    schema: {
      example: {
        updatedCount: 3,
        message: 'Successfully updated 3 timeslip(s) to APPROVED status'
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'No timeslips found with provided IDs' })
  @ApiBody({ type: BatchUpdateTimeslipStatusDto })
  async batchUpdateStatuses(@Body() dto: BatchUpdateTimeslipStatusDto) {
    return this.timeslipService.batchUpdateStatuses(dto);
  }
}