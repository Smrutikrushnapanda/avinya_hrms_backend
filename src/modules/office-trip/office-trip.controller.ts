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
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { OfficeTripService } from './office-trip.service';
import {
  CreateOfficeTripDto,
  UpdateOfficeTripStatusDto,
} from './dto/create-office-trip.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';

@ApiTags('OfficeTrips')
@RequireProPlan()
@Controller('office-trips')
@UseGuards(JwtAuthGuard)
export class OfficeTripController {
  constructor(private readonly officeTripService: OfficeTripService) {}

  private actorId(actor: any): string {
    return actor?.userId || actor?.id || '';
  }

  private isPrivileged(actor: any): boolean {
    return !!actor?.roles?.some((r: { roleName: string }) =>
      ['ADMIN', 'HR', 'SUPERADMIN', 'MANAGER'].includes(r.roleName),
    );
  }

  private resolveTargetUser(actor: any, targetUserId: string): string {
    if (this.isPrivileged(actor)) return targetUserId;
    if (this.actorId(actor) !== targetUserId) {
      throw new ForbiddenException(
        'You can only access your own office trip requests.',
      );
    }
    return targetUserId;
  }

  private assertSameOrg(actor: any, organizationId: string) {
    if (
      !actor?.roles?.some(
        (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
      ) &&
      actor?.organizationId &&
      actor.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'You can only access office trips for your own organization.',
      );
    }
  }

  @Post(':userId')
  @ApiOperation({ summary: 'Submit an office trip / client visit request' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async createTrip(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateOfficeTripDto,
    @GetUser() actor: any,
  ) {
    return this.officeTripService.createTrip(
      this.resolveTargetUser(actor, userId),
      dto,
    );
  }

  @Get('my/:userId')
  @ApiOperation({ summary: "Get employee's own office trip requests" })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getMyTrips(
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: any,
  ) {
    return this.officeTripService.getMyTrips(
      this.resolveTargetUser(actor, userId),
    );
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'MANAGER')
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
    @GetUser() actor: any,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('tripType') tripType?: string,
  ) {
    this.assertSameOrg(actor, organizationId);
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
  async getTripById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() actor: any,
  ) {
    const trip = await this.officeTripService.getTripById(id);
    if (
      !actor?.roles?.some(
        (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
      )
    ) {
      if (this.isPrivileged(actor)) {
        if (trip.organizationId !== actor?.organizationId) {
          throw new ForbiddenException(
            'You can only access office trips for your own organization.',
          );
        }
      } else if (trip.userId !== this.actorId(actor)) {
        throw new ForbiddenException(
          'You can only access your own office trip requests.',
        );
      }
    }
    return trip;
  }

  @Put(':id/status/:approverId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Approve or reject an office trip request (admin)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('approverId', ParseUUIDPipe) _approverId: string,
    @Body() dto: UpdateOfficeTripStatusDto,
    @GetUser() actor: any,
  ) {
    return this.officeTripService.updateStatus(id, this.actorId(actor), dto);
  }

  @Delete(':id/:userId')
  @ApiOperation({ summary: 'Delete own office trip request (pending only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: any,
  ) {
    await this.officeTripService.deleteTrip(
      id,
      this.resolveTargetUser(actor, userId),
    );
    return { message: 'Office trip request deleted' };
  }
}
