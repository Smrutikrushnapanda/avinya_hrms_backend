import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DeepPartial,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  Attendance,
  AttendanceLog,
  BiometricDevice,
  WifiLocation,
} from './entities';
import {
  CreateAttendanceLogDto,
  CreateBiometricDeviceDto,
  CreateWifiLocationDto,
} from './dto';
import { Common } from '../common/common.service';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay } from 'date-fns';
import { Holiday, LeaveRequest } from '../leave/entities';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceLog)
    private attendanceLogRepo: Repository<AttendanceLog>,

    @InjectRepository(Attendance)
    private attendanceRepo: Repository<Attendance>,

    @InjectRepository(BiometricDevice)
    private biometricDeviceRepo: Repository<BiometricDevice>,

    @InjectRepository(WifiLocation)
    private wifiRepo: Repository<WifiLocation>,

    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,

    @InjectRepository(Holiday)
    private holidayRepo: Repository<Holiday>,

    private readonly common: Common,
  ) {}

  async createWifiLocation(dto: CreateWifiLocationDto): Promise<WifiLocation> {
    const { organizationId, ...rest } = dto;

    const wifi = this.wifiRepo.create({
      ...rest,
      organization: { id: organizationId },
    });

    return this.wifiRepo.save(wifi);
  }

  async registerBiometricDevice(
    dto: CreateBiometricDeviceDto,
  ): Promise<BiometricDevice> {
    const device = this.biometricDeviceRepo.create(dto);
    return this.biometricDeviceRepo.save(device);
  }

  async logAttendance(
    dto: CreateAttendanceLogDto,
    photoFile?: Express.Multer.File,
  ): Promise<{
    status: 'success' | 'anomaly';
    data: AttendanceLog;
    reasons?: string[];
  }> {
    const {
      userId,
      organizationId,
      timestamp,
      latitude,
      longitude,
      wifiBssid,
      enableFaceValidation,
      enableWifiValidation,
      enableGPSValidation,
    } = dto;

    const punchTime = new Date(timestamp);
    const dateStr = punchTime.toISOString().split('T')[0];

    // 1️⃣ Upload photo to GCS
    let photoUrl: string | undefined;
    if (photoFile) {
      const destination = `images/attendance/${userId}/${Date.now()}-${uuidv4()}.jpg`;
      photoUrl = await this.common.uploadFile(
        photoFile.buffer,
        destination,
        photoFile.mimetype,
        true,
      );
    }

    // 2️⃣ Determine punch type
    const existingLogs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        timestamp: Between(
          new Date(`${dateStr}T00:00:00.000Z`),
          new Date(`${dateStr}T23:59:59.999Z`),
        ),
      },
      order: { timestamp: 'ASC' },
    });

    let type: 'check-in' | 'check-out' | 'break-start' | 'break-end' =
      'check-in';
    if (existingLogs.length > 0) {
      const lastType = existingLogs[existingLogs.length - 1].type;
      type = lastType === 'check-in' ? 'check-out' : 'check-in';
    }

    // 3️⃣ Anomaly Detection
    let anomalyFlag = false;
    const anomalyReasons: string[] = [];

    // 3a. Wi-Fi + GPS
    if (enableWifiValidation && wifiBssid) {
      const knownWifi = await this.wifiRepo.findOne({
        where: {
          organization: { id: organizationId },
          bssid: wifiBssid,
          isActive: true,
        },
      });

      if (!knownWifi) {
        anomalyFlag = true;
        anomalyReasons.push('Unrecognized Wi-Fi');
      } else if (
        enableGPSValidation &&
        latitude != null &&
        longitude != null &&
        knownWifi.latitude != null &&
        knownWifi.longitude != null
      ) {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          knownWifi.latitude,
          knownWifi.longitude,
        );
        if (distance > (knownWifi.allowedRadiusMeters ?? 50)) {
          anomalyFlag = true;
          anomalyReasons.push('GPS location mismatch for Wi-Fi');
        }
      }
    }

    // 3b. Face Match
    let match: { score: number; verified: boolean } | undefined;
    if (enableFaceValidation && photoUrl) {
      match = await this.performFaceMatch(userId, photoUrl);
      if (!match.verified) {
        anomalyFlag = true;
        anomalyReasons.push(`Face mismatch (score: ${match.score})`);
      }
    }

    // 4️⃣ Save attendance log (even if anomaly)
    const log: DeepPartial<AttendanceLog> = {
      user: { id: userId },
      organization: { id: organizationId },
      timestamp: new Date(timestamp),
      type,
      source: dto.source,
      photoUrl,
      latitude,
      longitude,
      locationAddress: dto.locationAddress,
      wifiSsid: dto.wifiSsid,
      wifiBssid: dto.wifiBssid,
      biometricDevice: dto.biometricDeviceId
        ? { id: dto.biometricDeviceId }
        : undefined,
      deviceInfo: dto.deviceInfo,
      faceMatchScore: match?.score,
      faceVerified: match?.verified,
      anomalyFlag,
      anomalyReason: anomalyFlag ? anomalyReasons.join(', ') : null,
    };

    const created = this.attendanceLogRepo.create(log);
    const saved = await this.attendanceLogRepo.save(created);

    // 5️⃣ Respond to frontend
    return anomalyFlag
      ? {
          status: 'anomaly',
          data: saved,
          reasons: anomalyReasons,
        }
      : {
          status: 'success',
          data: saved,
        };
  }

  async getTodayLogsByUserOrg(
    organizationId: string,
    userId: string,
  ): Promise<{
    logs: AttendanceLog[];
    punchInTime: Date | null;
    lastPunch: Date | null;
  }> {
    const today = new Date();
    const from = new Date(today.setHours(0, 0, 0, 0));
    const to = new Date(today.setHours(23, 59, 59, 999));

    const logs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
        timestamp: Between(from, to),
        anomalyFlag: false,
      },
      order: { timestamp: 'ASC' },
    });

    const punchInTime = logs.length > 0 ? logs[0].timestamp : null;
    const lastPunch = logs.length > 0 ? logs[logs.length - 1].timestamp : null;

    return {
      logs,
      punchInTime,
      lastPunch,
    };
  }

  async getDailyAttendance(
    userId: string,
    date: string,
  ): Promise<Attendance | null> {
    return this.attendanceRepo.findOne({
      where: {
        user: { id: userId },
        attendanceDate: date,
      },
      relations: ['user', 'organization'],
    });
  }

  async getHolidaysForFinancialYear(
    organizationId: string,
    fromYear: number,
  ): Promise<Holiday[]> {
    const fromDate = new Date(fromYear, 3, 1); // April 1st (month is 0-indexed)
    const toDate = new Date(fromYear + 1, 2, 31); // March 31st of next year

    return this.holidayRepo.find({
      where: {
        organizationId,
        date: Between(fromDate, toDate),
      },
      order: {
        date: 'ASC',
      },
    });
  }

  async getMonthlyAttendanceByUser(
    userId: string,
    month: number,
    year: number,
    organizationId: string,
  ): Promise<
    {
      date: string;
      status: Attendance['status'] | 'absent' | 'pending';
      isSunday: boolean;
      isHoliday: boolean;
      holidayName?: string;
      isOptional?: boolean;
    }[]
  > {
    const formatDateLocal = (date: Date): string => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const fromDate = new Date(year, month - 1, 1);
    const toDate = new Date(year, month, 0);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Attendance records
    const attendanceRecords = await this.attendanceRepo.find({
      where: {
        user: { id: userId },
        attendanceDate: Between(
          formatDateLocal(fromDate),
          formatDateLocal(toDate),
        ),
      },
      order: { attendanceDate: 'ASC' },
    });

    const attendanceMap = new Map<string, Attendance['status']>();
    for (const entry of attendanceRecords) {
      attendanceMap.set(entry.attendanceDate, entry.status);
    }

    // Holidays for the month
    const holidays = await this.holidayRepo.find({
      where: {
        organizationId,
        date: Between(fromDate, toDate),
      },
    });

    const holidayMap = new Map<string, { name: string; isOptional: boolean }>();
    for (const h of holidays) {
      holidayMap.set(formatDateLocal(new Date(h.date)), {
        name: h.name,
        isOptional: h.isOptional,
      });
    }

    const results: {
      date: string;
      status: Attendance['status'] | 'absent' | 'pending';
      isSunday: boolean;
      isHoliday: boolean;
      holidayName?: string;
      isOptional?: boolean;
    }[] = [];

    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateLocal(d);
      const isSunday = d.getDay() === 0;
      const holidayInfo = holidayMap.get(dateStr);

      let status: Attendance['status'] | 'absent' | 'pending';
      const existingStatus = attendanceMap.get(dateStr);

      if (existingStatus) {
        status = existingStatus;
      } else if (d > yesterday) {
        status = 'pending';
      } else {
        status = 'absent';
      }

      results.push({
        date: dateStr,
        status,
        isSunday,
        isHoliday: !!holidayInfo,
        holidayName: holidayInfo?.name,
        isOptional: holidayInfo?.isOptional,
      });
    }

    return results;
  }

  async getTodayAnomalies(): Promise<AttendanceLog[]> {
    const today = new Date();
    const from = new Date(today.setHours(0, 0, 0, 0));
    const to = new Date(today.setHours(23, 59, 59, 999));

    return this.attendanceLogRepo.find({
      where: {
        anomalyFlag: true,
        timestamp: Between(from, to),
      },
      order: { timestamp: 'DESC' },
    });
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371e3; // Earth radius in meters

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async performFaceMatch(
    userId: string,
    photoUrl: string,
  ): Promise<{ score: number; verified: boolean }> {
    // Stub logic — replace with actual service call
    return {
      score: 0.92,
      verified: true,
    };
  }

  async generateDailyAttendanceSummary(date: Date = new Date()): Promise<void> {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    const dateStr = startOfDay.toISOString().split('T')[0];

    // 1️⃣ Fetch attendance logs for the day (non-anomalous)
    const logs = await this.attendanceLogRepo.find({
      where: {
        timestamp: Between(startOfDay, endOfDay),
        anomalyFlag: false,
      },
      relations: ['user', 'organization'],
      order: { timestamp: 'ASC' },
    });

    // 2️⃣ Fetch approved leave requests for the day
    const leaveRequests = await this.leaveRequestRepo.find({
      where: {
        status: 'APPROVED',
        startDate: LessThanOrEqual(dateStr),
        endDate: MoreThanOrEqual(dateStr),
      },
      relations: ['user'],
    });

    // 3️⃣ Group logs and leaves
    const logGroups = new Map<string, AttendanceLog[]>();
    logs.forEach((log) => {
      const key = `${log.user.id}|${log.organization.id}`;
      if (!logGroups.has(key)) logGroups.set(key, []);
      logGroups.get(key)!.push(log);
    });

    const leaveMap = new Map<string, LeaveRequest>();
    leaveRequests.forEach((leave) => {
      const key = `${leave.user.id}`;
      leaveMap.set(key, leave);
    });

    const allUserOrgKeys = new Set([
      ...Array.from(logGroups.keys()),
      ...Array.from(leaveMap.keys()).map((userId) => {
        const orgKey = Array.from(logGroups.keys()).find((k) =>
          k.startsWith(`${userId}|`),
        );
        return orgKey ?? `${userId}|UNKNOWN`;
      }),
    ]);

    for (const key of allUserOrgKeys) {
      const [userId, organizationId] = key.split('|');

      const logs = logGroups.get(key) ?? [];
      const leave = leaveMap.get(userId);

      const attendanceDate = dateStr;

      const baseData: DeepPartial<Attendance> = {
        user: { id: userId },
        organization: {
          id: organizationId !== 'UNKNOWN' ? organizationId : undefined,
        },
        attendanceDate,
        processedAt: new Date(),
      };

      // 💼 If on leave
      if (leave) {
        baseData.status = 'on-leave';
      }

      // ✅ If attendance logs exist
      else if (logs.length > 0) {
        const inLog = logs.find((log) => log.type === 'check-in') ?? logs[0];
        const outLog =
          [...logs].reverse().find((log) => log.type === 'check-out') ?? inLog;

        const workingMinutes = Math.floor(
          (+outLog.timestamp - +inLog.timestamp) / 60000,
        );

        Object.assign(baseData, {
          inTime: inLog.timestamp,
          outTime: outLog.timestamp,
          workingMinutes,
          status: workingMinutes >= 240 ? 'present' : 'half-day',
          inPhotoUrl: inLog.photoUrl,
          inLatitude: inLog.latitude,
          inLongitude: inLog.longitude,
          inLocationAddress: inLog.locationAddress,
          inWifiSsid: inLog.wifiSsid,
          inWifiBssid: inLog.wifiBssid,
          inDeviceInfo: inLog.deviceInfo,
          outPhotoUrl: outLog.photoUrl,
          outLatitude: outLog.latitude,
          outLongitude: outLog.longitude,
          outLocationAddress: outLog.locationAddress,
          outWifiSsid: outLog.wifiSsid,
          outWifiBssid: outLog.wifiBssid,
          outDeviceInfo: outLog.deviceInfo,
        });
      }

      // 🚫 No logs, no leave → mark as absent
      else {
        baseData.status = 'absent';
      }

      const existing = await this.attendanceRepo.findOne({
        where: { user: { id: userId }, attendanceDate },
      });

      if (existing) {
        await this.attendanceRepo.update(existing.id, baseData);
      } else {
        await this.attendanceRepo.save(this.attendanceRepo.create(baseData));
      }
    }
  }
}
