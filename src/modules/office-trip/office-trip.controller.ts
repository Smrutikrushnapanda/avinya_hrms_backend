import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { OfficeTripService } from './office-trip.service';
import {
  CreateOfficeTripDto,
  UpdateOfficeTripStatusDto,
} from './dto/create-office-trip.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';

@ApiTags('OfficeTrips')
@RequireProPlan()
@Controller('office-trips')
@UseGuards(JwtAuthGuard)
export class OfficeTripController {
  constructor(private readonly officeTripService: OfficeTripService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Submit an office trip / client visit request' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async createTrip(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateOfficeTripDto,
  ) {
    return this.officeTripService.createTrip(userId, dto);
  }

  @Get('my/:userId')
  @ApiOperation({ summary: "Get employee's own office trip requests" })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getMyTrips(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.officeTripService.getMyTrips(userId);
  }

  @Get('all')
  @ApiOperation({
    summary: 'Get all office trip requests for an organization (admin)',
  })
  @ApiQuery({ name: 'organizationId', type: 'string' })
  @ApiQuery({ name: 'employeeId', required: false, type: 'string' })
  @ApiQuery({ name: 'departmentId', required: false, type: 'string' })
  @ApiQuery({ name: 'dateFrom', required: false, type: 'string' })
  @ApiQuery({ name: 'dateTo', required: false, type: 'string' })
  @ApiQuery({ name: 'status', required: false, type: 'string' })
  @ApiQuery({ name: 'tripType', required: false, type: 'string' })
  async getAllTrips(
    @Query('organizationId') organizationId: string,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('tripType') tripType?: string,
  ) {
    return this.officeTripService.getAllTrips(organizationId, {
      employeeId,
      departmentId,
      dateFrom,
      dateTo,
      status,
      tripType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get office trip request detail (admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getTripById(@Param('id', ParseUUIDPipe) id: string) {
    return this.officeTripService.getTripById(id);
  }

  @Put(':id/status/:approverId')
  @ApiOperation({ summary: 'Approve or reject an office trip request (admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('approverId', ParseUUIDPipe) approverId: string,
    @Body() dto: UpdateOfficeTripStatusDto,
  ) {
    return this.officeTripService.updateStatus(id, approverId, dto);
  }

  @Delete(':id/:userId')
  @ApiOperation({ summary: 'Delete own office trip request (pending only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.officeTripService.deleteTrip(id, userId);
    return { message: 'Office trip request deleted' };
  }
}
