import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  CreateAttendanceLogDto,
  CreateBiometricDeviceDto,
  CreateWifiLocationDto,
} from './dto';
import {
  AttendanceLog,
  Attendance,
  BiometricDevice,
  WifiLocation,
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
} from '@nestjs/swagger';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
}
