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
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { TimeslipService } from './timeslip.service';
import { CreateTimeslipDto } from './dto/create-timeslip.dto';
import { UpdateTimeslipDto } from './dto/update-timeslip.dto';
import { ApproveTimeslipDto } from './dto/approve-timeslip.dto';
import { BatchUpdateTimeslipStatusDto } from './dto/batch-update-timeslip-status.dto';
import { BatchApproveSubmissionsDto } from './dto/batch-approve-submissions.dto';


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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutes
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
  return this.timeslipService.batchUpdateStatuses(dto, dto.approverId);
}

  @Get('all-by-employee/:employeeId')
@ApiOperation({ 
  summary: 'Get all timeslips for a specific employee',
  description: 'Fetch all timeslips for an employee without pagination'
})
@ApiParam({ name: 'employeeId', description: 'Employee ID (UUID)' })
@ApiOkResponse({ 
  description: 'List of all timeslips for the employee returned.',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'c3ce15eb-3c04-4cf2-9596-73de7f006ba1' },
        date: { type: 'string', example: '2025-09-06' },
        missing_type: { type: 'string', enum: ['IN', 'OUT', 'BOTH'] },
        corrected_in: { type: 'string', nullable: true },
        corrected_out: { type: 'string', nullable: true },
        reason: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
        approvals: { type: 'array', items: { type: 'object' } }
      }
    }
  }
})
@ApiNotFoundResponse({ description: 'Employee not found or no timeslips exist.' })
async getAllByEmployee(@Param('employeeId') employeeId: string) {
  return this.timeslipService.findAllByEmployee(employeeId);
}

/** ---- Get timeslips for an approver ---- */
@Get('approver/:approverId')
@ApiOperation({ 
  summary: 'Get all timeslips assigned to a specific approver',
  description: 'Fetch all timeslips that are assigned to an approver for approval, including employee details'
})
@ApiParam({ name: 'approverId', description: 'Approver ID (Employee UUID)' })
@ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'], description: 'Filter by approval status' })
@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
@ApiOkResponse({ 
  description: 'List of timeslips for the approver returned.',
  schema: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'c3ce15eb-3c04-4cf2-9596-73de7f006ba1' },
            date: { type: 'string', example: '2025-09-06' },
            missing_type: { type: 'string', enum: ['IN', 'OUT', 'BOTH'] },
            corrected_in: { type: 'string', nullable: true },
            corrected_out: { type: 'string', nullable: true },
            reason: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
            created_at: { type: 'string' },
            employee: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                employeeCode: { type: 'string' },
                workEmail: { type: 'string' },
                photoUrl: { type: 'string' },
                department: { type: 'object' },
                designation: { type: 'object' }
              }
            },
            approval: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                action: { type: 'string' },
                remarks: { type: 'string' },
                acted_at: { type: 'string' }
              }
            }
          }
        }
      },
      pagination: { type: 'object' }
    }
  }
})
@ApiNotFoundResponse({ description: 'Approver not found or no timeslips assigned.' })
async getTimeslipsByApprover(
  @Param('approverId') approverId: string,
  @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
  @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
) {
  const maxLimit = 100;
  if (limit > maxLimit) limit = maxLimit;
  
  return this.timeslipService.findByApprover(approverId, { status, page, limit });
}

@Post('batch-approve-submissions')
@ApiOperation({
  summary: 'Batch approve/reject timeslip submissions',
  description: 'Update multiple TimeslipApproval records. Automatically updates timeslip status when workflow is complete.'
})
@ApiCreatedResponse({
  description: 'Approvals updated successfully',
  schema: {
    example: {
      updatedCount: 2,
      completedTimeslips: ['timeslip-uuid-1'],
      message: 'Successfully approved 2 approval(s)',
      errors: []
    }
  }
})
@ApiBody({ type: BatchApproveSubmissionsDto })
async batchApproveSubmissions(@Body() dto: BatchApproveSubmissionsDto) {
  return this.timeslipService.batchApproveSubmissions(dto);
}

}