import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  CreateAttendanceLogDto,
  CreateBiometricDeviceDto,
  CreateWifiLocationDto,
  UpdateWifiLocationDto,
  UpdateAttendanceSettingsDto,
  CreateHolidayDto,
  UpdateHolidayDto,
} from './dto';
import {
  AttendanceLog,
  Attendance,
  BiometricDevice,
  WifiLocation,
  AttendanceSettings,
} from './entities';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { DateTime } from 'luxon';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // 📋 Get or create attendance settings for organization
  @Get('settings')
  @ApiOperation({ summary: 'Get attendance settings for organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiResponse({
    status: 200,
    description: 'Attendance settings',
    type: AttendanceSettings,
  })
  async getSettings(@Query('organizationId') organizationId: string) {
    return this.attendanceService.getAttendanceSettings(organizationId);
  }

  // ✏️ Update attendance settings for organization
  @Put('settings')
  @ApiOperation({ summary: 'Update attendance settings for organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiResponse({
    status: 200,
    description: 'Updated attendance settings',
    type: AttendanceSettings,
  })
  async updateSettings(
    @Query('organizationId') organizationId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    return this.attendanceService.updateAttendanceSettings(organizationId, dto);
  }

  // ➕ Create a new Wi-Fi location
  @Post('wifi-locations')
  @ApiOperation({ summary: 'Create Wi-Fi Location' })
  @ApiResponse({
    status: 201,
    description: 'Wi-Fi location created successfully',
    type: WifiLocation,
  })
  async createWifiLocation(
    @Body() dto: CreateWifiLocationDto,
  ): Promise<WifiLocation> {
    return this.attendanceService.createWifiLocation(dto);
  }

  // 📋 List Wi-Fi locations for organization
  @Get('wifi-locations')
  @ApiOperation({ summary: 'List Wi-Fi locations for organization' })
  @ApiQuery({ name: 'organizationId', type: 'string', required: true })
  @ApiResponse({ status: 200, description: 'List of Wi-Fi locations', type: [WifiLocation] })
  async getWifiLocations(
    @Query('organizationId') organizationId: string,
  ): Promise<WifiLocation[]> {
    return this.attendanceService.getWifiLocations(organizationId);
  }

  // ✏️ Update a Wi-Fi location
  @Put('wifi-locations/:id')
  @ApiOperation({ summary: 'Update Wi-Fi location' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Updated Wi-Fi location', type: WifiLocation })
  async updateWifiLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWifiLocationDto,
  ): Promise<WifiLocation> {
    return this.attendanceService.updateWifiLocation(id, dto);
  }

  // 🗑️ Delete a Wi-Fi location
  @Delete('wifi-locations/:id')
  @ApiOperation({ summary: 'Delete Wi-Fi location' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Wi-Fi location deleted' })
  async deleteWifiLocation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.attendanceService.deleteWifiLocation(id);
  }

  // 📟 Register a biometric device
  @Post('devices')
  @ApiOperation({ summary: 'Register Biometric Device' })
  @ApiResponse({
    status: 201,
    description: 'Biometric device registered',
    type: BiometricDevice,
  })
  async registerDevice(
    @Body() dto: CreateBiometricDeviceDto,
  ): Promise<BiometricDevice> {
    return this.attendanceService.registerBiometricDevice(dto);
  }

  // 🕒 Log a punch (with optional photo)
  @Post('log')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiOperation({ summary: 'Log a punch (check-in/check-out)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Log attendance with optional photo',
    schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        source: {
          type: 'string',
          enum: ['mobile', 'web', 'biometric', 'wifi', 'manual'],
        },
        timestamp: { type: 'string', format: 'date-time' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        locationAddress: { type: 'string' },
        wifiSsid: { type: 'string' },
        wifiBssid: { type: 'string' },
        biometricDeviceId: { type: 'string', format: 'uuid' },
        deviceInfo: { type: 'string' },
        enableFaceValidation: { type: 'boolean' },
        enableWifiValidation: { type: 'boolean' },
        enableGPSValidation: { type: 'boolean' },
        photo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance log submitted (success or anomaly)',
    schema: {
      example: {
        status: 'success',
        data: {
          id: 'uuid',
          organization: { id: 'uuid' },
          user: { id: 'uuid' },
          timestamp: '2025-07-12T09:45:00.000Z',
          type: 'check-in',
          source: 'mobile',
          photoUrl: 'https://storage.googleapis.com/...',
          faceMatchScore: 0.92,
          faceVerified: true,
          latitude: 20.3494624,
          longitude: 85.8078853,
          locationAddress: 'DLF Cybercity, Bhubaneswar',
          wifiSsid: 'Airtel_Pstech world',
          wifiBssid: '106.215.147.214',
          deviceInfo: 'Android v12, Samsung M12',
          anomalyFlag: false,
          anomalyReason: null,
          createdAt: '2025-07-12T11:58:46.368Z',
        },
      },
    },
  })
  async logAttendance(
    @Body() dto: CreateAttendanceLogDto,
    @UploadedFile() photo?: Express.Multer.File,
  ): Promise<{
    status: 'success' | 'anomaly';
    data: AttendanceLog;
    reasons?: string[];
  }> {
    return this.attendanceService.logAttendance(dto, photo);
  }

  @Get('today-logs')
  @ApiOperation({ summary: "Get today's logs by user and organization" })
  @ApiQuery({
    name: 'organizationId',
    type: 'string',
    required: true,
    example: '24facd21-265a-4edd-8fd1-bc69a036f755',
  })
  @ApiQuery({
    name: 'userId',
    type: 'string',
    required: true,
    example: '08936291-d8f4-4429-ac51-2879ea34df43',
  })
  @ApiOkResponse({
    description: "Today's attendance logs with punch-in and last punch info",
    schema: {
      type: 'object',
      properties: {
        logs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              timestamp: { type: 'string', format: 'date-time' },
              type: {
                type: 'string',
                enum: ['check-in', 'check-out', 'break-start', 'break-end'],
              },
              source: {
                type: 'string',
                enum: ['mobile', 'web', 'biometric', 'wifi', 'manual'],
              },
              photoUrl: { type: 'string', format: 'uri' },
              faceMatchScore: { type: 'number' },
              faceVerified: { type: 'boolean' },
              latitude: { type: 'string' },
              longitude: { type: 'string' },
              locationAddress: { type: 'string' },
              wifiSsid: { type: 'string' },
              wifiBssid: { type: 'string' },
              deviceInfo: { type: 'string' },
              anomalyFlag: { type: 'boolean' },
              anomalyReason: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        punchInTime: { type: 'string', format: 'date-time' },
        lastPunch: { type: 'string', format: 'date-time' },
      },
      example: {
        logs: [
          {
            id: '5f44e190-da5f-48cb-89cf-8acb60d7c9c7',
            timestamp: '2025-07-13T09:45:00.000Z',
            type: 'check-in',
            source: 'mobile',
            photoUrl:
              'https://storage.googleapis.com/hrms-global/images/attendance/08936291-d8f4-4429-ac51-2879ea34df43/1752383850351-a2e454fa-7222-404f-bb20-f5cd90be3cd1.jpg',
            faceMatchScore: 0.92,
            faceVerified: true,
            latitude: '20.3494624',
            longitude: '85.8078853',
            locationAddress: 'DLF Cybercity, Bhubaneswar',
            wifiSsid: 'Airtel_Pstech world',
            wifiBssid: '106.215.147.214',
            deviceInfo: 'Android v12, Samsung M12',
            anomalyFlag: false,
            anomalyReason: null,
            createdAt: '2025-07-13T05:17:34.735Z',
          },
          {
            id: '85fc08c0-8154-46c8-bce4-0b8041f15b61',
            timestamp: '2025-07-13T09:45:00.000Z',
            type: 'check-out',
            source: 'mobile',
            photoUrl:
              'https://storage.googleapis.com/hrms-global/images/attendance/08936291-d8f4-4429-ac51-2879ea34df43/1752383913484-3c7d5e4b-f671-4157-9695-3b863c65cc51.jpg',
            faceMatchScore: 0.92,
            faceVerified: true,
            latitude: '20.3494624',
            longitude: '85.8078853',
            locationAddress: 'DLF Cybercity, Bhubaneswar',
            wifiSsid: 'Airtel_Pstech world',
            wifiBssid: '106.215.147.214',
            deviceInfo: 'Android v12, Samsung M12',
            anomalyFlag: false,
            anomalyReason: null,
            createdAt: '2025-07-13T05:18:42.528Z',
          },
          {
            id: '6946e858-9333-4970-a505-3af660e7e611',
            timestamp: '2025-07-13T10:15:00.000Z',
            type: 'check-out',
            source: 'mobile',
            photoUrl:
              'https://storage.googleapis.com/hrms-global/images/attendance/08936291-d8f4-4429-ac51-2879ea34df43/1752383986552-e9f027c0-946d-4885-abf2-7370d8ea4f2c.jpg',
            faceMatchScore: 0.92,
            faceVerified: true,
            latitude: '20.3494624',
            longitude: '85.8078853',
            locationAddress: 'DLF Cybercity, Bhubaneswar',
            wifiSsid: 'Airtel_Pstech world',
            wifiBssid: '106.215.147.214',
            deviceInfo: 'Android v12, Samsung M12',
            anomalyFlag: false,
            anomalyReason: null,
            createdAt: '2025-07-13T05:19:50.622Z',
          },
        ],
        punchInTime: '2025-07-13T09:45:00.000Z',
        lastPunch: '2025-07-13T10:15:00.000Z',
      },
    },
  })
  async getTodayLogsByUserOrg(
    @Query('organizationId') organizationId: string,
    @Query('userId') userId: string,
  ) {
    return this.attendanceService.getTodayLogsByUserOrg(organizationId, userId);
  }

  // 📅 Get daily attendance summary
  @Get('summary/:userId')
  @ApiOperation({ summary: 'Get User Attendance Summary by Date' })
  @ApiParam({ name: 'userId', type: 'string', description: 'User UUID' })
  @ApiQuery({
    name: 'date',
    required: true,
    type: 'string',
    example: '2025-07-12',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily attendance summary (or null if not found)',
    type: Attendance,
  })
  async getUserAttendance(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('date') date: string,
  ): Promise<Attendance | null> {
    return this.attendanceService.getDailyAttendance(userId, date);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Get attendance logs for a user by month' })
  @ApiQuery({
    name: 'userId',
    type: 'string',
    required: true,
    example: '08936291-d8f4-4429-ac51-2879ea34df43',
  })
  @ApiQuery({ name: 'month', type: 'number', required: true, example: 7 }) // July
  @ApiQuery({ name: 'year', type: 'number', required: true, example: 2025 })
  @ApiOkResponse({
    description: 'Attendance list for the given month',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/Attendance' },
    },
  })
  async getMonthlyAttendance(
    @Query('userId') userId: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Query('organizationId') organizationId: string,
  ) {
    return this.attendanceService.getMonthlyAttendanceByUser(
      userId,
      month,
      year,
      organizationId,
    );
  }

  @Get('daily-stats')
  async getDailyStats(
    @Query('organizationId') organizationId: string,
    @Query('date') dateStr: string, // format: 'YYYY-MM-DD'
  ) {
    if (!organizationId || !dateStr) {
      throw new Error('Missing organizationId or date');
    }

    return this.attendanceService.getDailyAttendanceStatsWithComparison(
      organizationId,
      dateStr,
    );
  }

  @Get('holidays/financial-year')
  @ApiOperation({ summary: 'Get holidays in a financial year' })
  @ApiQuery({ name: 'organizationId', required: true, type: String })
  @ApiQuery({
    name: 'fromYear',
    required: true,
    type: String,
    description: 'Start year of financial year (e.g., 2025)',
  })
  async getHolidaysForFinancialYear(
    @Query('organizationId') organizationId: string,
    @Query('fromYear') fromYear: string,
  ) {
    const year = parseInt(fromYear, 10);
    if (!organizationId || isNaN(year)) {
      throw new BadRequestException('Invalid organizationId or fromYear');
    }

    return this.attendanceService.getHolidaysForFinancialYear(
      organizationId,
      year,
    );
  }

  // ➕ Create holiday
  @Post('holidays')
  @ApiOperation({ summary: 'Create holiday' })
  async createHoliday(@Body() dto: CreateHolidayDto) {
    return this.attendanceService.createHoliday(dto);
  }

  // ✏️ Update holiday
  @Put('holidays/:id')
  @ApiOperation({ summary: 'Update holiday' })
  async updateHoliday(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.attendanceService.updateHoliday(id, dto);
  }

  // 🗑️ Delete holiday
  @Delete('holidays/:id')
  @ApiOperation({ summary: 'Delete holiday' })
  async deleteHoliday(@Param('id', ParseIntPipe) id: number) {
    await this.attendanceService.deleteHoliday(id);
    return { message: 'Holiday deleted successfully' };
  }

  @Get('by-date')
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'Format: YYYY-MM-DD' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or email',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PRESENT', 'ABSENT', 'HALF_DAY'],
    description: 'Filter by status',
  })
  async getAttendanceByDate(
    @Query('organizationId') organizationId: string,
    @Query('date') date: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('status') status?: Attendance['status'],
  ) {
    return this.attendanceService.getAttendanceByDateWithFilters(
      organizationId,
      date,
      page,
      limit,
      search,
      status,
    );
  }

  @Post('process-daily-summary')
  @ApiQuery({
    name: 'date',
    required: false,
    type: 'string',
    example: '2025-07-13',
  })
  @ApiOperation({ summary: 'Generate attendance summary for a specific date' })
  async processSummary(@Query('date') date?: string) {
    // If no date passed, use today's date in Asia/Kolkata
    const finalDate = date
      ? new Date(date)
      : new Date(DateTime.now().setZone('Asia/Kolkata').toISODate());
  
    await this.attendanceService.generateDailyAttendanceSummary(finalDate);
    console.log(`Attendance summary generated for date ${finalDate}`);
    return { message: 'Summary generated' };
  }

  // ⚠️ View today's anomaly logs
  @Get('anomalies/today')
  @ApiOperation({ summary: "Today's Anomalous Attendance Logs" })
  @ApiResponse({
    status: 200,
    description: 'All logs with anomalies recorded today',
    type: [AttendanceLog],
  })
  async getTodayAnomalies(): Promise<AttendanceLog[]> {
    return this.attendanceService.getTodayAnomalies();
  }

  //New api @Nihar
  @Get('report')
@ApiOperation({ summary: 'Get attendance report with user filters' })
@ApiQuery({
  name: 'organizationId',
  type: 'string',
  required: true,
  example: '24facd21-265a-4edd-8fd1-bc69a036f755',
})
@ApiQuery({
  name: 'year',
  type: 'number',
  required: true,
  example: 2025,
})
@ApiQuery({
  name: 'month',
  type: 'number',
  required: true,
  example: 8,
})
@ApiQuery({
  name: 'userIds',
  type: 'string',
  required: false,
  description: 'Comma-separated user IDs or "ALL" for all users',
  example: 'ALL or user1,user2,user3',
})
@ApiOkResponse({
  description: 'Attendance report data with user filtering',
  schema: {
    type: 'object',
    properties: {
      reportData: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userName: { type: 'string' },
            email: { type: 'string' },
            employeeCode: { type: 'string' },
            totalWorkingDays: { type: 'number' },
            presentDays: { type: 'number' },
            absentDays: { type: 'number' },
            halfDays: { type: 'number' },
            onLeaveDays: { type: 'number' },
            attendancePercentage: { type: 'number' },
            totalWorkingHours: { type: 'number' },
            averageWorkingHours: { type: 'number' },
            dailyRecords: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  status: { type: 'string' },
                  inTime: { type: 'string' },
                  outTime: { type: 'string' },
                  workingHours: { type: 'number' },
                  isHoliday: { type: 'boolean' },
                  isSunday: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      summary: {
        type: 'object',
        properties: {
          totalEmployees: { type: 'number' },
          period: { type: 'string' },
          workingDays: { type: 'number' },
          holidays: { type: 'number' },
        },
      },
    },
  },
})
async getAttendanceReport(
  @Query('organizationId') organizationId: string,
  @Query('year') year: number,
  @Query('month') month: number,
  @Query('userIds') userIds: string = 'ALL',
) {
  return this.attendanceService.getAttendanceReport(
    organizationId,
    year,
    month,
    userIds,
  );
}

}
