import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DeepPartial,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Employee } from '../employee/entities/employee.entity';
import {
  Attendance,
  AttendanceLog,
  BiometricDevice,
  WifiLocation,
  AttendanceSettings,
  Branch,
  AttendanceShift,
} from './entities';
import {
  CreateAttendanceLogDto,
  ToggleBreakDto,
  CreateBiometricDeviceDto,
  CreateWifiLocationDto,
  UpdateWifiLocationDto,
  CreateAttendanceSettingsDto,
  UpdateAttendanceSettingsDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  CreateBranchDto,
  UpdateBranchDto,
  CreateShiftDto,
  UpdateShiftDto,
} from './dto';
import { Common } from '../common/common.service';
import { StorageService } from './storage.service';
import { AttendancePhotoType } from './dto';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, format as formatLocal } from 'date-fns';
import { toZonedTime, format as formatTZ } from 'date-fns-tz';
import { Holiday, LeaveRequest } from '../leave/entities';
import { DateTime } from 'luxon';

type WorkingDayRuleSource = {
  workingDays?: number[] | null;
  weekdayOffRules?: Record<string, number[]> | null;
};

type ShiftRuleSource = WorkingDayRuleSource & {
  workStartTime: string;
  workEndTime: string;
  halfDayCutoffTime?: string | null;
  graceMinutes?: number | null;
  lateThresholdMinutes?: number | null;
};

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

    @InjectRepository(AttendanceSettings)
    private attendanceSettingsRepo: Repository<AttendanceSettings>,

    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,

    @InjectRepository(Holiday)
    private holidayRepo: Repository<Holiday>,

    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,

    private readonly common: Common,
    private readonly storageService: StorageService,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
    @InjectRepository(AttendanceShift)
    private shiftRepo: Repository<AttendanceShift>,
  ) {}

  private normalizeBranchName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private canonicalBranchName(name: string): string {
    return this.normalizeBranchName(name).toLowerCase();
  }

  private normalizeShiftName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private canonicalShiftName(name: string): string {
    return this.normalizeShiftName(name).toLowerCase();
  }

  async createWifiLocation(dto: CreateWifiLocationDto): Promise<WifiLocation> {
    const { organizationId, ...rest } = dto;

    const wifi = this.wifiRepo.create({
      ...rest,
      organization: { id: organizationId },
    });

    return this.wifiRepo.save(wifi);
  }

  async getWifiLocations(organizationId: string): Promise<WifiLocation[]> {
    return this.wifiRepo.find({
      where: { organization: { id: organizationId } },
      order: { createdAt: 'DESC' },
    });
  }

  async updateWifiLocation(id: string, dto: UpdateWifiLocationDto): Promise<WifiLocation> {
    const wifi = await this.wifiRepo.findOne({ where: { id } });
    if (!wifi) {
      throw new NotFoundException(`WiFi location with ID ${id} not found`);
    }
    Object.assign(wifi, dto);
    return this.wifiRepo.save(wifi);
  }

  async deleteWifiLocation(id: string): Promise<void> {
    const result = await this.wifiRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`WiFi location with ID ${id} not found`);
    }
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
    const shiftConfig = await this.resolveShiftConfig(organizationId, userId);
    const { windowStart, windowEnd, attendanceDate } = this.computeShiftWindow(
      punchTime,
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const isOvernight = this.isOvernightShift(
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const dayBounds = this.getDayBoundsInZone(punchTime);
    const logsWindowStart = isOvernight ? windowStart : dayBounds.start;
    const logsWindowEnd = isOvernight ? windowEnd : dayBounds.end;
    const branchId = shiftConfig.branchId || null;

    // 1️⃣ Determine punch type
    const existingLogs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
        timestamp: Between(logsWindowStart, logsWindowEnd),
      },
      relations: ['user'],
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
      const knownWifis = await this.wifiRepo.find({
        where: {
          organization: { id: organizationId },
          isActive: true,
        },
        select: ['bssid', 'latitude', 'longitude', 'allowedRadiusMeters'],
      });

      const matchedWifi = knownWifis.find((wifi) => wifi.bssid === wifiBssid);

      if (!matchedWifi) {
        anomalyFlag = true;
        anomalyReasons.push('Unrecognized Wi-Fi');
      } else if (
        enableGPSValidation &&
        latitude != null &&
        longitude != null &&
        matchedWifi.latitude != null &&
        matchedWifi.longitude != null
      ) {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          matchedWifi.latitude,
          matchedWifi.longitude,
        );
        if (distance > (matchedWifi.allowedRadiusMeters ?? 50)) {
          anomalyFlag = true;
          anomalyReasons.push('GPS location mismatch for Wi-Fi');
        }
      }
    }

    // 3c. GPS-only validation against office/branch geofence (primary + alternates)
    if (enableGPSValidation) {
      if (latitude == null || longitude == null) {
        anomalyFlag = true;
        anomalyReasons.push('GPS location required but not provided');
      } else {
        const gpsOk = this.isWithinAllowedLocations(
          latitude,
          longitude,
          shiftConfig.officeLatitude,
          shiftConfig.officeLongitude,
          shiftConfig.allowedRadiusMeters,
          shiftConfig.altLocations ?? [],
        );
        if (!gpsOk) {
          anomalyFlag = true;
          anomalyReasons.push('GPS outside allowed office radius');
        }
      }
    }

    // 3b. Upload photo to Supabase Storage (private) and optional face match
    let photoKey: string | undefined;
    let signedPhotoUrl: string | undefined;
    let match: { score: number; verified: boolean } | undefined;

    if (photoFile) {
      photoKey = await this.storageService.uploadAttendancePhoto(
        photoFile,
        organizationId,
        userId,
        type === 'check-in'
          ? AttendancePhotoType.CHECKIN
          : AttendancePhotoType.CHECKOUT,
      );
      signedPhotoUrl = await this.storageService.getSignedUrl(photoKey);
    }

    if (enableFaceValidation && signedPhotoUrl) {
      match = await this.performFaceMatch(userId, signedPhotoUrl);
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
      photoUrl: photoKey, // store only storage key
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
      branch: branchId ? { id: branchId } : undefined,
    };

    const created = this.attendanceLogRepo.create(log);
    const saved = await this.attendanceLogRepo.save(created);
    const photoUrl = saved.photoUrl
      ? await this.storageService.getSignedUrl(saved.photoUrl)
      : undefined;

    // 5️⃣ Update attendance summary for the day (ensure dashboard shows data)
    const dayLogs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
        timestamp: Between(logsWindowStart, logsWindowEnd),
      },
      order: { timestamp: 'ASC' },
    });

    if (dayLogs.length > 0) {
      const sortedLogs = [...dayLogs].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const inLog = sortedLogs[0];
      const outLog = sortedLogs[sortedLogs.length - 1] ?? inLog;

      // If there's only a single punch, treat the employee as present
      // immediately and wait for clock-out to refine working time.
      const hasClockOut = sortedLogs.length > 1;
      const workingMinutes = hasClockOut
        ? Math.floor((+outLog.timestamp - +inLog.timestamp) / 60000)
        : 0;

      const anyAnomaly = sortedLogs.some((l) => l.anomalyFlag);
      const anomalyReason = sortedLogs
        .map((l) => l.anomalyReason)
        .filter(Boolean)
        .join(', ') || undefined;

      const status = this.determineAttendanceStatus(
        workingMinutes,
        hasClockOut,
        shiftConfig,
        inLog.timestamp,
      );

      const baseData: DeepPartial<Attendance> = {
        user: { id: userId },
        organization: { id: organizationId },
        attendanceDate,
        processedAt: new Date(),
        inTime: inLog.timestamp,
        outTime: hasClockOut ? outLog.timestamp : undefined,
        workingMinutes: Math.max(0, workingMinutes),
        status,
        inPhotoUrl: inLog.photoUrl ?? undefined,
        inLatitude: inLog.latitude,
        inLongitude: inLog.longitude,
        inLocationAddress: inLog.locationAddress,
        inWifiSsid: inLog.wifiSsid,
        inWifiBssid: inLog.wifiBssid,
        inDeviceInfo: inLog.deviceInfo,
        outPhotoUrl:
          hasClockOut && outLog.photoUrl ? outLog.photoUrl : undefined,
        outLatitude: hasClockOut ? outLog.latitude : undefined,
        outLongitude: hasClockOut ? outLog.longitude : undefined,
        outLocationAddress: hasClockOut ? outLog.locationAddress : undefined,
        outWifiSsid: hasClockOut ? outLog.wifiSsid : undefined,
        outWifiBssid: hasClockOut ? outLog.wifiBssid : undefined,
        outDeviceInfo: hasClockOut ? outLog.deviceInfo : undefined,
        anomalyFlag: anyAnomaly,
        anomalyReason,
        branch: branchId ? { id: branchId } : undefined,
      };

      const existingAttendance = await this.attendanceRepo.findOne({
        where: {
          user: { id: userId },
          organization: { id: organizationId },
          attendanceDate,
        },
      });
      if (existingAttendance) {
        await this.attendanceRepo.update(existingAttendance.id, baseData);
      } else {
        await this.attendanceRepo.save(this.attendanceRepo.create(baseData));
      }
    }

    // 6️⃣ Respond to frontend
    const responseData = {
      ...saved,
      photoUrl: photoUrl ?? null,
    };

    return anomalyFlag
      ? {
          status: 'anomaly',
          data: responseData,
          reasons: anomalyReasons,
        }
      : {
          status: 'success',
          data: responseData,
        };
  }

  async getAttendanceByDateWithFilters(
    organizationId: string,
    date: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: Attendance['status'] | 'all' | string,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
    const normalizedDate = this.normalizeAttendanceDate(date);
    const normalizedStatus = this.normalizeAttendanceStatus(status);

    const query = this.attendanceRepo
      .createQueryBuilder('att')
      .distinct(true)
      .leftJoinAndSelect('att.user', 'user')
      .leftJoin(
        'employees',
        'emp',
        'emp.user_id = user.id AND emp.organization_id = :organizationId',
        { organizationId },
      ) // join employees table
      .where('att.organization_id = :organizationId', { organizationId })
      .andWhere('att.attendanceDate = :date', { date: normalizedDate });

    if (normalizedStatus && normalizedStatus !== 'all') {
      query.andWhere('att.status = :status', { status: normalizedStatus });
    }

    if (search) {
      query.andWhere(
        `(user.firstName ILIKE :search OR user.middleName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR emp.employee_code ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await query.getCount();

    query
      .addSelect([
        'emp.employee_code AS "employeeCode"',
        'emp.photo_url AS "photoUrl"',
        'emp.passport_photo_url AS "passportPhotoUrl"',
      ])
      .orderBy('att.inTime', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    const rawResults = await query.getRawAndEntities();
    const records = rawResults.entities;
    const raw = rawResults.raw;

    const formatTime = (date?: Date): string | undefined => {
      if (!date) return undefined;

      // Convert from UTC to Asia/Kolkata
      const local = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(
        'Asia/Kolkata',
      );

      const hours = local.hour.toString().padStart(2, '0');
      const minutes = local.minute.toString().padStart(2, '0');
      const suffix = local.hour >= 12 ? 'PM' : 'AM';
      const formattedHour = (local.hour % 12 || 12).toString().padStart(2, '0');

      return `${formattedHour}:${minutes} ${suffix}`;
    };

    const results = await Promise.all(
      records.map(async (att, i) => {
        const hasBothPunches = Boolean(att.inTime) && Boolean(att.outTime);
        const workedMinutes = att.workingMinutes ?? 0;
        const isIncompleteHours =
          att.status === 'absent' && hasBothPunches && workedMinutes > 0;
        const profileImageKey =
          (raw[i].passportPhotoUrl as string | null) ??
          (raw[i].photoUrl as string | null);
        const profileImageSigned =
          profileImageKey && !profileImageKey.startsWith('http')
            ? await this.storageService
                .getSignedUrl(profileImageKey)
                .catch(() => null)
            : profileImageKey;

        const inSigned =
          att.inPhotoUrl && !att.inPhotoUrl.startsWith('http')
            ? await this.storageService
                .getSignedUrl(att.inPhotoUrl)
                .catch(() => null)
            : att.inPhotoUrl;

        const outSigned =
          att.outPhotoUrl && !att.outPhotoUrl.startsWith('http')
            ? await this.storageService
                .getSignedUrl(att.outPhotoUrl)
                .catch(() => null)
            : att.outPhotoUrl;

        return {
          userId: att.user.id,
          userName: [att.user.firstName, att.user.middleName, att.user.lastName]
            .filter(Boolean)
            .join(' '),
          email: att.user.email,

          employeeCode: raw[i].employeeCode,
          profileImage: profileImageKey,
          profileImageSigned,

          status: isIncompleteHours ? 'incomplete-hours' : att.status,
          rawStatus: att.status,
          workingMinutes: workedMinutes,

          inTime: formatTime(att.inTime),
          inPhotoUrl: att.inPhotoUrl,
          inPhotoUrlSigned: inSigned,
          inLatitude: att.inLatitude,
          inLongitude: att.inLongitude,
          inLocationAddress: att.inLocationAddress,
          inWifiSsid: att.inWifiSsid,
          inWifiBssid: att.inWifiBssid,
          inDeviceInfo: att.inDeviceInfo,

          outTime: formatTime(att.outTime),
          outPhotoUrl: att.outPhotoUrl,
          outPhotoUrlSigned: outSigned,
          outLatitude: att.outLatitude,
          outLongitude: att.outLongitude,
          outLocationAddress: att.outLocationAddress,
          outWifiSsid: att.outWifiSsid,
          outWifiBssid: att.outWifiBssid,
          outDeviceInfo: att.outDeviceInfo,

          anomalyFlag: att.anomalyFlag,
          anomalyReason: att.anomalyReason,
        };
      }),
    );

    return {
      results,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
      },
    };
  }

  private normalizeAttendanceDate(dateInput: string): string {
    const trimmed = (dateInput || '').trim();
    if (!trimmed) return trimmed;

    const parsedIso = DateTime.fromISO(trimmed, { zone: 'Asia/Kolkata' });
    if (parsedIso.isValid) {
      return parsedIso.toFormat('yyyy-MM-dd');
    }

    const parsedJsDate = new Date(trimmed);
    if (!Number.isNaN(parsedJsDate.getTime())) {
      return DateTime.fromJSDate(parsedJsDate)
        .setZone('Asia/Kolkata')
        .toFormat('yyyy-MM-dd');
    }

    return trimmed;
  }

  private normalizeAttendanceStatus(
    status?: Attendance['status'] | 'all' | string,
  ): Attendance['status'] | 'all' | undefined {
    if (!status) return undefined;

    const normalized = status.toString().trim().toLowerCase();
    if (!normalized) return undefined;

    if (normalized === 'all') return 'all';

    const canonical = normalized.replace(/[_\s]+/g, '-');
    const statusMap: Record<string, Attendance['status']> = {
      present: 'present',
      absent: 'absent',
      late: 'late',
      holiday: 'holiday',
      weekend: 'weekend',
      'half-day': 'half-day',
      halfday: 'half-day',
      'on-leave': 'on-leave',
      onleave: 'on-leave',
      'work-from-home': 'work-from-home',
      workfromhome: 'work-from-home',
      wfh: 'work-from-home',
    };

    return statusMap[canonical];
  }

  async getDailyAttendanceStatsWithComparison(
    organizationId: string,
    dateStr: string,
  ) {
    const getStats = async (date: string) => {
      const attendance = await this.attendanceRepo.find({
        where: {
          organization: { id: organizationId },
          attendanceDate: date,
        },
      });

      const total_present = attendance.filter(
        (a) =>
          a.status === 'present' ||
          a.status === 'late' ||
          a.status === 'half-day',
      ).length;

      const earlyClockIn = attendance.filter((a) => {
        if (!a.inTime) return false;
        const inTime = new Date(a.inTime);
        const clockLimit = new Date(a.attendanceDate);
        clockLimit.setHours(10, 0, 0, 0); // 10:00 AM on that date
        return inTime <= clockLimit;
      }).length;

      const lateClockIn = attendance.filter((a) => {
        if (!a.inTime) return false;
        const inTime = new Date(a.inTime);
        const clockLimit = new Date(a.attendanceDate);
        clockLimit.setHours(10, 0, 0, 0); // 10:00 AM
        return inTime > clockLimit;
      }).length;

      const notPresentSummary = {
        incompleteHours: attendance.filter(
          (a) =>
            a.status === 'absent' &&
            Boolean(a.inTime) &&
            Boolean(a.outTime) &&
            Number(a.workingMinutes ?? 0) > 0,
        ).length,
        absent: attendance.filter(
          (a) =>
            a.status === 'absent' &&
            !(
              Boolean(a.inTime) &&
              Boolean(a.outTime) &&
              Number(a.workingMinutes ?? 0) > 0
            ),
        ).length,
        noClockIn: attendance.filter((a) => !a.inTime).length,
        noClockOut: attendance.filter((a) => !a.outTime).length,
        invalid: attendance.filter((a) => a.anomalyFlag).length,
      };

      return {
        presentSummary: {
          total_present,
          earlyClockIn,
          lateClockIn,
        },
        notPresentSummary,
      };
    };

    const todayStats = await getStats(dateStr);

    const yesterday = new Date(dateStr);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayStats = await getStats(yesterdayStr);

    const diff = (today: number, yest: number) => today - yest;

    return {
      date: dateStr,
      presentSummary: {
        total_present: todayStats.presentSummary.total_present,
        total_presentDiff: diff(
          todayStats.presentSummary.total_present,
          yesterdayStats.presentSummary.total_present,
        ),

        earlyClockIn: todayStats.presentSummary.earlyClockIn,
        earlyClockInDiff: diff(
          todayStats.presentSummary.earlyClockIn,
          yesterdayStats.presentSummary.earlyClockIn,
        ),

        lateClockIn: todayStats.presentSummary.lateClockIn,
        lateClockInDiff: diff(
          todayStats.presentSummary.lateClockIn,
          yesterdayStats.presentSummary.lateClockIn,
        ),
      },
      notPresentSummary: {
        incompleteHours: todayStats.notPresentSummary.incompleteHours,
        incompleteHoursDiff: diff(
          todayStats.notPresentSummary.incompleteHours,
          yesterdayStats.notPresentSummary.incompleteHours,
        ),

        absent: todayStats.notPresentSummary.absent,
        absentDiff: diff(
          todayStats.notPresentSummary.absent,
          yesterdayStats.notPresentSummary.absent,
        ),

        noClockIn: todayStats.notPresentSummary.noClockIn,
        noClockInDiff: diff(
          todayStats.notPresentSummary.noClockIn,
          yesterdayStats.notPresentSummary.noClockIn,
        ),

        noClockOut: todayStats.notPresentSummary.noClockOut,
        noClockOutDiff: diff(
          todayStats.notPresentSummary.noClockOut,
          yesterdayStats.notPresentSummary.noClockOut,
        ),

        invalid: todayStats.notPresentSummary.invalid,
        invalidDiff: diff(
          todayStats.notPresentSummary.invalid,
          yesterdayStats.notPresentSummary.invalid,
        ),
      },
    };
  }

  async getTodayLogsByUserOrg(
    organizationId: string,
    userId: string,
  ): Promise<{
    logs: AttendanceLog[];
    punchInTime: Date | null;
    lastPunch: Date | null;
    isOnBreak: boolean;
    activeBreakSince: Date | null;
    attendanceStatus: Attendance['status'] | null;
    workStartTime: string | null;
    graceMinutes: number | null;
    lateThresholdMinutes: number | null;
  }> {
    const now = new Date();
    const shiftConfig = await this.resolveShiftConfig(organizationId, userId);
    const { windowStart, windowEnd, attendanceDate } = this.computeShiftWindow(
      now,
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const isOvernight = this.isOvernightShift(
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const dayBounds = this.getDayBoundsInZone(now);
    const from = isOvernight ? windowStart : dayBounds.start;
    const to = isOvernight ? windowEnd : dayBounds.end;
    const dateStr = isOvernight ? attendanceDate : dayBounds.dateStr;

    const logs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
        timestamp: Between(from, to),
        anomalyFlag: false,
      },
      order: { timestamp: 'ASC' },
    });

    // Check if the Attendance summary has timeslip-corrected times
    const attendanceSummary = await this.attendanceRepo.findOne({
      where: { user: { id: userId }, attendanceDate: dateStr },
    });

    // Prefer corrected inTime/outTime from the Attendance record (set by timeslip approval)
    const punchInTime = attendanceSummary?.inTime ?? (logs.length > 0 ? logs[0].timestamp : null);
    const lastPunch = attendanceSummary?.outTime ?? (logs.length > 0 ? logs[logs.length - 1].timestamp : null);
    const { isOnBreak, activeBreakSince } = this.deriveBreakState(logs);

    return {
      logs,
      punchInTime,
      lastPunch,
      isOnBreak,
      activeBreakSince,
      attendanceStatus: attendanceSummary?.status ?? null,
      workStartTime: shiftConfig.workStartTime ?? null,
      graceMinutes: shiftConfig.graceMinutes ?? null,
      lateThresholdMinutes: shiftConfig.lateThresholdMinutes ?? null,
    };
  }

  async toggleBreakStatus(dto: ToggleBreakDto): Promise<{
    status: 'success';
    action: 'break-start' | 'break-end';
    isOnBreak: boolean;
    activeBreakSince: Date | null;
    data: AttendanceLog;
  }> {
    const actionTime = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const shiftConfig = await this.resolveShiftConfig(dto.organizationId, dto.userId);
    const { windowStart, windowEnd } = this.computeShiftWindow(
      actionTime,
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const isOvernight = this.isOvernightShift(
      shiftConfig.workStartTime,
      shiftConfig.workEndTime,
    );
    const dayBounds = this.getDayBoundsInZone(actionTime);
    const logsWindowStart = isOvernight ? windowStart : dayBounds.start;
    const logsWindowEnd = isOvernight ? windowEnd : dayBounds.end;

    const logs = await this.attendanceLogRepo.find({
      where: {
        user: { id: dto.userId },
        organization: { id: dto.organizationId },
        timestamp: Between(logsWindowStart, logsWindowEnd),
        anomalyFlag: false,
      },
      order: { timestamp: 'ASC' },
    });

    const latestCheckIn = [...logs]
      .reverse()
      .find((log) => log.type === 'check-in');
    const latestCheckOut = [...logs]
      .reverse()
      .find((log) => log.type === 'check-out');

    if (!latestCheckIn || (latestCheckOut && latestCheckOut.timestamp > latestCheckIn.timestamp)) {
      throw new BadRequestException(
        'Please check in first before using break toggle.',
      );
    }

    const breakState = this.deriveBreakState(logs);
    const action: 'break-start' | 'break-end' = breakState.isOnBreak
      ? 'break-end'
      : 'break-start';

    const created = this.attendanceLogRepo.create({
      organization: { id: dto.organizationId },
      user: { id: dto.userId },
      timestamp: actionTime,
      type: action,
      source: dto.source || 'web',
      latitude: dto.latitude,
      longitude: dto.longitude,
      locationAddress: dto.locationAddress,
      wifiSsid: dto.wifiSsid,
      wifiBssid: dto.wifiBssid,
      deviceInfo: dto.deviceInfo,
      anomalyFlag: false,
      anomalyReason: null,
      branch: shiftConfig.branchId ? { id: shiftConfig.branchId } : undefined,
    });
    const saved = await this.attendanceLogRepo.save(created);

    return {
      status: 'success',
      action,
      isOnBreak: action === 'break-start',
      activeBreakSince: action === 'break-start' ? saved.timestamp : null,
      data: saved,
    };
  }

  async getCurrentBreakStatus(organizationId: string, userId: string): Promise<{
    organizationId: string;
    userId: string;
    isOnBreak: boolean;
    activeBreakSince: Date | null;
    breakSessionsToday: number;
    activeBreakMinutes: number;
  }> {
    const logsResult = await this.getTodayLogsByUserOrg(organizationId, userId);
    const logs = logsResult.logs || [];
    const breakState = this.deriveBreakState(logs);

    return {
      organizationId,
      userId,
      isOnBreak: breakState.isOnBreak,
      activeBreakSince: breakState.activeBreakSince,
      breakSessionsToday: logs.filter((log) => log.type === 'break-start').length,
      activeBreakMinutes:
        breakState.isOnBreak && breakState.activeBreakSince
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(breakState.activeBreakSince).getTime()) /
                  60000,
              ),
            )
          : 0,
    };
  }

  async getLiveBreakOverview(organizationId: string): Promise<{
    organizationId: string;
    generatedAt: string;
    totalOnBreak: number;
    employees: {
      userId: string;
      employeeName: string;
      email: string;
      activeBreakSince: Date;
      breakMinutes: number;
    }[];
  }> {
    const { start: from, end: to } = this.getDayBoundsInZone(new Date());

    const logs = await this.attendanceLogRepo.find({
      where: {
        organization: { id: organizationId },
        timestamp: Between(from, to),
        anomalyFlag: false,
      },
      relations: ['user'],
      order: { timestamp: 'ASC' },
    });

    const logsByUser = new Map<string, AttendanceLog[]>();
    for (const log of logs) {
      const key = log.user?.id;
      if (!key) continue;
      if (!logsByUser.has(key)) logsByUser.set(key, []);
      logsByUser.get(key)!.push(log);
    }

    const employees: {
      userId: string;
      employeeName: string;
      email: string;
      activeBreakSince: Date;
      breakMinutes: number;
    }[] = [];

    logsByUser.forEach((userLogs, userId) => {
      const breakState = this.deriveBreakState(userLogs);
      if (!breakState.isOnBreak || !breakState.activeBreakSince) return;
      const user = userLogs[0]?.user;
      const employeeName = [user?.firstName, user?.middleName, user?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      employees.push({
        userId,
        employeeName: employeeName || user?.userName || 'Employee',
        email: user?.email || '',
        activeBreakSince: breakState.activeBreakSince,
        breakMinutes: Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(breakState.activeBreakSince).getTime()) /
              60000,
          ),
        ),
      });
    });

    employees.sort((a, b) => b.breakMinutes - a.breakMinutes);

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      totalOnBreak: employees.length,
      employees,
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

  async createHoliday(dto: CreateHolidayDto): Promise<Holiday> {
    const { organizationId, date, ...rest } = dto;
    const holiday = this.holidayRepo.create({
      ...rest,
      organization: { id: organizationId },
      organizationId,
      date: typeof date === 'string' ? new Date(date) : date,
    });
    return this.holidayRepo.save(holiday);
  }

  async updateHoliday(id: number, dto: UpdateHolidayDto): Promise<Holiday> {
    const holiday = await this.holidayRepo.findOne({ where: { id } });
    if (!holiday) {
      throw new NotFoundException(`Holiday with ID ${id} not found`);
    }
    if (dto.date) {
      holiday.date = typeof dto.date === 'string' ? new Date(dto.date) : dto.date;
    }
    if (dto.name !== undefined) holiday.name = dto.name;
    if (dto.description !== undefined) holiday.description = dto.description;
    if (dto.isOptional !== undefined) holiday.isOptional = dto.isOptional;
    return this.holidayRepo.save(holiday);
  }

  async deleteHoliday(id: number): Promise<void> {
    const result = await this.holidayRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Holiday with ID ${id} not found`);
    }
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
      inTime?: string;
      outTime?: string;
      inPhotoUrl?: string;
      outPhotoUrl?: string;
      workingMinutes?: number;
      anomalyFlag?: boolean;
      anomalyReason?: string;
      inLocationAddress?: string;
      outLocationAddress?: string;
    }[]
  > {
    const formatDateLocal = (date: Date): string => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const formatTime = (
      date: Date | string | null,
      timeZone = 'Asia/Kolkata',
    ): string | undefined => {
      if (!date) return undefined;
      const parsedDate = typeof date === 'string' ? new Date(date) : date;
      const zonedDate = toZonedTime(parsedDate, timeZone);
      return formatTZ(zonedDate, 'hh:mm a');
    };

    const fromDate = new Date(year, month - 1, 1);
    const toDate = new Date(year, month, 0);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const shiftConfig = await this.resolveShiftConfig(organizationId, userId);
    const isWorkingDay = (d: Date) => this.isWorkingDayForDate(d, shiftConfig);

    // 1. Attendance full record map
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

    const attendanceMap = new Map<string, Attendance>();
    for (const entry of attendanceRecords) {
      attendanceMap.set(entry.attendanceDate, entry);
    }

    // 2. Log map
    const logRows = await this.attendanceLogRepo
      .createQueryBuilder('log')
      .select([
        "TO_CHAR(log.timestamp, 'YYYY-MM-DD') AS date",
        'MIN(log.timestamp) AS in_time',
        'MAX(log.timestamp) AS out_time',
      ])
      .where('log.user_id = :userId', { userId })
      .andWhere('log.timestamp BETWEEN :start AND :end', {
        start: fromDate.toISOString(),
        end: toDate.toISOString(),
      })
      .groupBy("TO_CHAR(log.timestamp, 'YYYY-MM-DD')")
      .getRawMany();

    const logMap = new Map<string, { inTime?: string; outTime?: string }>();
    for (const log of logRows) {
      const dateStr = log.date;
      const inTime = formatTime(log.in_time);
      const outTime = formatTime(log.out_time);
      logMap.set(dateStr, { inTime, outTime });
    }

    // 3. Holiday map
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

    // 4. Approved leave map (full-day coverage)
    const approvedLeaves = await this.leaveRequestRepo.find({
      where: {
        user: { id: userId },
        status: 'APPROVED',
        startDate: LessThanOrEqual(formatDateLocal(toDate)),
        endDate: MoreThanOrEqual(formatDateLocal(fromDate)),
      },
    });

    const leaveSet = new Set<string>();
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatDateLocal(d);
        leaveSet.add(key);
      }
    }

    // 4. Final result
    const results: {
      date: string;
      status: Attendance['status'] | 'absent' | 'pending';
      isSunday: boolean;
      isHoliday: boolean;
      holidayName?: string;
      isOptional?: boolean;
      inTime?: string;
      outTime?: string;
      inPhotoUrl?: string;
      outPhotoUrl?: string;
      workingMinutes?: number;
      anomalyFlag?: boolean;
      anomalyReason?: string;
      inLocationAddress?: string;
      outLocationAddress?: string;
    }[] = [];

    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateLocal(d);
      const isSunday = !isWorkingDay(d);
      const holidayInfo = holidayMap.get(dateStr);
      const isOnLeave = leaveSet.has(dateStr);

      const attendanceEntry = attendanceMap.get(dateStr);
      const logInfo = logMap.get(dateStr);

      let status: Attendance['status'] | 'absent' | 'pending' =
        attendanceEntry?.status ??
        (holidayInfo
          ? 'holiday'
          : isSunday
            ? 'weekend'
            : isOnLeave
              ? 'on-leave'
              : d > yesterday
                ? 'pending'
                : 'absent');

      const computedWorkingMinutes =
        attendanceEntry?.workingMinutes ??
        (attendanceEntry?.inTime && attendanceEntry?.outTime
          ? Math.max(
              0,
              Math.floor(
                (+new Date(attendanceEntry.outTime) -
                  +new Date(attendanceEntry.inTime)) /
                  60000,
              ),
            )
          : undefined);

      results.push({
        date: dateStr,
        status,
        isSunday,
        isHoliday: !!holidayInfo,
        holidayName: holidayInfo?.name,
        isOptional: holidayInfo?.isOptional,
        inTime: attendanceEntry?.inTime
          ? formatTime(attendanceEntry.inTime)
          : logInfo?.inTime,
        outTime: attendanceEntry?.outTime
          ? formatTime(attendanceEntry.outTime)
          : logInfo?.outTime,
        inPhotoUrl: attendanceEntry?.inPhotoUrl,
        outPhotoUrl: attendanceEntry?.outPhotoUrl,
        workingMinutes: computedWorkingMinutes,
        anomalyFlag: attendanceEntry?.anomalyFlag ?? false,
        anomalyReason: attendanceEntry?.anomalyReason,
        inLocationAddress: attendanceEntry?.inLocationAddress,
        outLocationAddress: attendanceEntry?.outLocationAddress,
      });
    }

    return results;
  }

  // ✅ UPDATED METHOD: Include user information in today's anomalies
  async getTodayAnomalies(): Promise<any[]> {
    const today = new Date();
    const from = new Date(today.setHours(0, 0, 0, 0));
    const to = new Date(today.setHours(23, 59, 59, 999));

    const queryBuilder = this.attendanceLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.anomalyFlag = :anomalyFlag', { anomalyFlag: true })
      .andWhere('log.timestamp BETWEEN :from AND :to', { from, to })
      .orderBy('log.timestamp', 'DESC');

    const results = await queryBuilder.getMany();

    // Transform the results to include userId at the root level and structured user info
    return results.map(log => ({
      id: log.id,
      userId: log.user?.id, // Add userId to root level
      timestamp: log.timestamp,
      type: log.type,
      source: log.source,
      photoUrl: log.photoUrl,
      faceMatchScore: log.faceMatchScore,
      faceVerified: log.faceVerified,
      latitude: log.latitude,
      longitude: log.longitude,
      locationAddress: log.locationAddress,
      wifiSsid: log.wifiSsid,
      wifiBssid: log.wifiBssid,
      deviceInfo: log.deviceInfo,
      anomalyFlag: log.anomalyFlag,
      anomalyReason: log.anomalyReason,
      createdAt: log.createdAt,
      user: {
        id: log.user?.id,
        firstName: log.user?.firstName,
        lastName: log.user?.lastName,
        email: log.user?.email,
        userName: log.user?.userName,
        // Add any other user fields you need from the User entity
      }
    }));
  }

  private deriveBreakState(logs: AttendanceLog[]): {
    isOnBreak: boolean;
    activeBreakSince: Date | null;
  } {
    const sortedLogs = [...logs].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let isOnBreak = false;
    let activeBreakSince: Date | null = null;

    for (const log of sortedLogs) {
      if (log.type === 'check-out') {
        isOnBreak = false;
        activeBreakSince = null;
      } else if (log.type === 'break-start') {
        isOnBreak = true;
        activeBreakSince = log.timestamp;
      } else if (log.type === 'break-end') {
        isOnBreak = false;
        activeBreakSince = null;
      }
    }

    return { isOnBreak, activeBreakSince };
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

  private isWithinAllowedLocations(
    latitude: number,
    longitude: number,
    primaryLat?: number | null,
    primaryLon?: number | null,
    defaultRadius?: number | null,
    altLocations: { latitude: number; longitude: number; radiusMeters?: number }[] = [],
  ): boolean {
    const locations: { lat: number; lon: number; radius: number }[] = [];

    if (primaryLat != null && primaryLon != null) {
      locations.push({
        lat: Number(primaryLat),
        lon: Number(primaryLon),
        radius: defaultRadius ?? 100,
      });
    }

    for (const loc of altLocations) {
      if (loc.latitude != null && loc.longitude != null) {
        locations.push({
          lat: Number(loc.latitude),
          lon: Number(loc.longitude),
          radius: loc.radiusMeters ?? defaultRadius ?? 100,
        });
      }
    }

    // If no geofence configured, allow
    if (locations.length === 0) return true;

    return locations.some((loc) => {
      const dist = this.calculateDistance(latitude, longitude, loc.lat, loc.lon);
      return dist <= loc.radius;
    });
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

  private combineDateTime(base: Date, timeStr: string): Date {
    const [hh, mm, ss] = timeStr.split(':').map((t) => parseInt(t, 10));
    const dt = new Date(base);
    dt.setHours(hh || 0, mm || 0, ss || 0, 0);
    return dt;
  }

  private isOvernightShift(workStartTime: string, workEndTime: string): boolean {
    return this.parseTimeToMinutes(workEndTime) <= this.parseTimeToMinutes(workStartTime);
  }

  private getDayBoundsInZone(
    reference: Date,
    zone = 'Asia/Kolkata',
  ): { start: Date; end: Date; dateStr: string } {
    const zoned = DateTime.fromJSDate(reference).setZone(zone);
    return {
      start: zoned.startOf('day').toUTC().toJSDate(),
      end: zoned.endOf('day').toUTC().toJSDate(),
      dateStr: zoned.toFormat('yyyy-MM-dd'),
    };
  }

  private computeShiftWindow(
    punchTime: Date,
    workStartTime: string,
    workEndTime: string,
  ): { windowStart: Date; windowEnd: Date; attendanceDate: string } {
    let windowStart = this.combineDateTime(punchTime, workStartTime);
    let windowEnd = this.combineDateTime(punchTime, workEndTime);
    const crossesMidnight = windowEnd <= windowStart;

    if (crossesMidnight) {
      windowEnd.setDate(windowEnd.getDate() + 1);
      // If punch happens after midnight but before shift start, shift belongs to previous day
      if (punchTime < windowStart) {
        windowStart.setDate(windowStart.getDate() - 1);
        windowEnd.setDate(windowEnd.getDate() - 1);
      }
    }

    const attendanceDate = formatLocal(windowStart, 'yyyy-MM-dd');
    return { windowStart, windowEnd, attendanceDate };
  }

  private parseTimeToMinutes(timeStr: string): number {
    const [hh, mm] = timeStr.split(':').map((t) => parseInt(t, 10));
    const safeH = Number.isFinite(hh) ? hh : 0;
    const safeM = Number.isFinite(mm) ? mm : 0;
    return safeH * 60 + safeM;
  }

  private calculateShiftDurationMinutes(workStartTime: string, workEndTime: string): number {
    const start = this.parseTimeToMinutes(workStartTime);
    const end = this.parseTimeToMinutes(workEndTime);
    let diff = end - start;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }

  private calculateHalfDayThresholdMinutes(config: ShiftRuleSource): number {
    const fullShiftMinutes = this.calculateShiftDurationMinutes(
      config.workStartTime,
      config.workEndTime,
    );
    const cutoffTime = config.halfDayCutoffTime || '14:00:00';
    const start = this.parseTimeToMinutes(config.workStartTime);
    const cutoff = this.parseTimeToMinutes(cutoffTime);

    let threshold = cutoff - start;
    if (threshold <= 0) threshold += 24 * 60;
    if (threshold > fullShiftMinutes) threshold = fullShiftMinutes;
    return Math.max(1, threshold);
  }

  private determineAttendanceStatus(
    workingMinutes: number,
    hasClockOut: boolean,
    config: ShiftRuleSource,
    inTime?: Date | null,
  ): Attendance['status'] {
    const isLateCheckIn = inTime
      ? this.isLatePunchIn(new Date(inTime), config)
      : false;
    if (!hasClockOut) return isLateCheckIn ? 'late' : 'present';
    const fullShiftMinutes = this.calculateShiftDurationMinutes(
      config.workStartTime,
      config.workEndTime,
    );
    const halfDayThreshold = this.calculateHalfDayThresholdMinutes(config);
    if (workingMinutes >= fullShiftMinutes) {
      return isLateCheckIn ? 'late' : 'present';
    }
    if (workingMinutes >= halfDayThreshold) return 'half-day';
    return 'absent';
  }

  private isLatePunchIn(inTime: Date, config: ShiftRuleSource): boolean {
    const { windowStart } = this.computeShiftWindow(
      inTime,
      config.workStartTime,
      config.workEndTime,
    );
    const lateAfterMinutes =
      Number(config.graceMinutes ?? NaN) ||
      Number(config.lateThresholdMinutes ?? NaN) ||
      0;
    const safeLateAfter = Math.max(0, lateAfterMinutes);
    const lateCutoff = new Date(windowStart.getTime() + safeLateAfter * 60_000);
    return inTime.getTime() > lateCutoff.getTime();
  }

  private async resolveShiftConfig(organizationId: string, userId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      relations: ['branch', 'shift'],
    });

    let activeBranch: Branch | null = null;

    if (employee?.branchId) {
      activeBranch = await this.branchRepo.findOne({
        where: { id: employee.branchId, organizationId, isActive: true },
      });
    }

    if (employee?.shiftId) {
      const shift = await this.shiftRepo.findOne({
        where: {
          id: employee.shiftId,
          organizationId,
          isActive: true,
        },
      });

      if (shift) {
        const settings = activeBranch
          ? null
          : await this.getOrCreateAttendanceSettings(organizationId);

        return {
          shiftId: shift.id,
          branchId: activeBranch?.id ?? null,
          workStartTime: shift.workStartTime,
          workEndTime: shift.workEndTime,
          graceMinutes: shift.graceMinutes,
          lateThresholdMinutes: shift.lateThresholdMinutes,
          halfDayCutoffTime: shift.halfDayCutoffTime,
          workingDays: shift.workingDays,
          weekdayOffRules: shift.weekdayOffRules,
          officeLatitude: activeBranch?.officeLatitude ?? settings?.officeLatitude ?? null,
          officeLongitude:
            activeBranch?.officeLongitude ?? settings?.officeLongitude ?? null,
          allowedRadiusMeters:
            activeBranch?.allowedRadiusMeters ??
            settings?.allowedRadiusMeters ??
            100,
          altLocations: activeBranch?.altLocations ?? [],
        };
      }
    }

    if (activeBranch) {
      return {
        shiftId: null,
        branchId: activeBranch.id,
        workStartTime: activeBranch.workStartTime,
        workEndTime: activeBranch.workEndTime,
        graceMinutes: activeBranch.graceMinutes,
        lateThresholdMinutes: activeBranch.lateThresholdMinutes,
        halfDayCutoffTime: activeBranch.halfDayCutoffTime,
        workingDays: activeBranch.workingDays,
        weekdayOffRules: activeBranch.weekdayOffRules,
        officeLatitude: activeBranch.officeLatitude,
        officeLongitude: activeBranch.officeLongitude,
        allowedRadiusMeters: activeBranch.allowedRadiusMeters,
        altLocations: activeBranch.altLocations ?? [],
      };
    }

    const settings = await this.getOrCreateAttendanceSettings(organizationId);
    return {
      shiftId: null,
      branchId: null,
      workStartTime: settings.workStartTime,
      workEndTime: settings.workEndTime,
      graceMinutes: settings.graceMinutes,
      lateThresholdMinutes: settings.lateThresholdMinutes,
      halfDayCutoffTime: settings.halfDayCutoffTime,
      workingDays: settings.workingDays,
      weekdayOffRules: settings.weekdayOffRules,
      officeLatitude: settings.officeLatitude,
      officeLongitude: settings.officeLongitude,
      allowedRadiusMeters: settings.allowedRadiusMeters,
      altLocations: [],
    };
  }

  async generateDailyAttendanceSummary(date: Date = new Date()): Promise<void> {
    const start = startOfDay(date);
    const end = endOfDay(date);
    const dateStr = formatLocal(start, 'yyyy-MM-dd');

    // Cache user-level shift configs so branch calendar rules are reused during this run.
    const shiftConfigCache = new Map<
      string,
      Awaited<ReturnType<AttendanceService['resolveShiftConfig']>>
    >();
    const getShiftConfig = async (orgId: string, userId: string) => {
      const cacheKey = `${orgId}|${userId}`;
      if (!shiftConfigCache.has(cacheKey)) {
        shiftConfigCache.set(
          cacheKey,
          await this.resolveShiftConfig(orgId, userId),
        );
      }
      return shiftConfigCache.get(cacheKey)!;
    };

    const holidays = await this.holidayRepo.find({
      where: { date: Between(start, end) },
    });
    const holidaySet = new Set(
      holidays.map((h) => formatLocal(new Date(h.date), 'yyyy-MM-dd')),
    );

    // 1️⃣ Fetch attendance logs for the day (non-anomalous)
    const logs = await this.attendanceLogRepo.find({
      where: {
        timestamp: Between(start, end),
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

      const orgId = organizationId !== 'UNKNOWN' ? organizationId : undefined;
      const shiftConfig = orgId ? await getShiftConfig(orgId, userId) : null;
      const isWorking = shiftConfig
        ? this.isWorkingDayForDate(start, shiftConfig)
        : true;
      const isHoliday = holidaySet.has(attendanceDate);

      // 💼 If on leave
      if (leave) {
        baseData.status = 'on-leave';
      }

      // 🗓️ Holiday or weekend (no logs, no leave)
      else if (!isWorking || isHoliday) {
        baseData.status = isHoliday ? 'holiday' : 'weekend';
      }

      // ✅ If attendance logs exist
      else if (logs.length > 0) {
        const sortedLogs = [...logs].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const inLog = sortedLogs[0];
        const outLog = sortedLogs[sortedLogs.length - 1] ?? inLog;

        const workingMinutes = Math.floor(
          (+outLog.timestamp - +inLog.timestamp) / 60000,
        );
        const hasClockOut = sortedLogs.length > 1;

        Object.assign(baseData, {
          inTime: inLog.timestamp,
          outTime: outLog.timestamp,
          workingMinutes,
          status: shiftConfig
            ? this.determineAttendanceStatus(
                workingMinutes,
                hasClockOut,
                shiftConfig,
                inLog.timestamp,
              )
            : workingMinutes >= 480
              ? 'present'
              : workingMinutes >= 160
                ? 'half-day'
                : 'absent',
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

async getAttendanceReport(
  organizationId: string,
  year: number,
  month: number,
  userIdsString: string = 'ALL',
) {
  // Parse userIds from string
  const userIds = userIdsString === 'ALL' ? [] : userIdsString.split(',').map(id => id.trim()).filter(Boolean);

  // Get date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const formatDateLocal = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Build attendance query with CORRECTED joins
  let attendanceQuery = this.attendanceRepo
    .createQueryBuilder('att')
    .leftJoinAndSelect('att.user', 'user')
    .leftJoin(
      'employees',
      'emp',
      'emp.user_id = user.user_id AND emp.organization_id = :organizationId',
      { organizationId },
    )
    .leftJoin('departments', 'dept', 'emp.department_id = dept.id')
    .leftJoin('designations', 'desg', 'emp.designation_id = desg.id')
    // FIXED: Two-step join for manager
    // 1. Join to get the manager employee record
    .leftJoin('employees', 'managerEmp', 'managerEmp.id = emp.reporting_to') 
    // 2. Join to get the manager's user details  
    .leftJoin('users', 'managerUser', 'managerUser.user_id = managerEmp.user_id')
    .where('att.organization_id = :organizationId', { organizationId })
    .andWhere('att.attendanceDate BETWEEN :startDate AND :endDate', {
      startDate: formatDateLocal(startDate),
      endDate: formatDateLocal(endDate),
    });

  // Apply user filter if specific users are selected
  if (userIds.length > 0) {
    attendanceQuery = attendanceQuery.andWhere('user.user_id IN (:...userIds)', {
      userIds,
    });
  }

  attendanceQuery = attendanceQuery
    .addSelect([
      'emp.employee_code AS "employeeCode"',
      'emp.branch_id AS "branchId"',
      'dept.name AS "departmentName"',
      'desg.name AS "designationName"',
      // FIXED: Use managerUser fields for concatenation
      'CONCAT_WS(\' \', NULLIF(managerUser.first_name, \'\'), NULLIF(managerUser.middle_name, \'\'), NULLIF(managerUser.last_name, \'\')) AS "managerFullName"'
    ])
    .orderBy('user.first_name', 'ASC')
    .addOrderBy('att.attendanceDate', 'ASC');

  const rawResults = await attendanceQuery.getRawAndEntities();

  // Get holidays for the organization and period
  const holidays = await this.holidayRepo.find({
    where: {
      organizationId,
      date: Between(startDate, endDate),
    },
  });

  const holidaySet = new Set(
    holidays.map((h) => formatDateLocal(new Date(h.date))),
  );

  const settings = await this.getOrCreateAttendanceSettings(organizationId);
  const activeBranches = await this.branchRepo.find({
    where: { organizationId, isActive: true },
  });
  const activeBranchMap = new Map(activeBranches.map((branch) => [branch.id, branch]));
  const resolveWorkingDaySource = (branchId?: string | null): WorkingDayRuleSource => {
    if (branchId && activeBranchMap.has(branchId)) {
      return activeBranchMap.get(branchId)!;
    }
    return settings;
  };
  const isWorkingDayForBranch = (date: Date, branchId?: string | null) =>
    this.isWorkingDayForDate(date, resolveWorkingDaySource(branchId));

  // Generate all dates for the month
  const allDates: string[] = [];
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    allDates.push(formatDateLocal(new Date(d)));
  }

  // Calculate working days (excluding non-working days and holidays)
  const organizationWorkingDays = allDates.filter((date) => {
    return isWorkingDayForBranch(new Date(date), null) && !holidaySet.has(date);
  }).length;

  // Group attendance records by user
  const userAttendanceMap = new Map();

  // Process raw results to build user map
  rawResults.entities.forEach((entry, index) => {
    const userId = entry.user.id;
    const rawData = rawResults.raw[index];
    const empCode = rawData?.employeeCode || 'N/A';
    const branchId = (rawData?.branchId as string | null | undefined) || null;
    const departmentName = rawData?.departmentName || '';
    const designationName = rawData?.designationName || '';
    
    // Get the concatenated manager name from SQL and clean up spaces
    let managerName = rawData?.managerFullName || '';
    managerName = managerName.replace(/\s+/g, ' ').trim();

    if (!userAttendanceMap.has(userId)) {
      userAttendanceMap.set(userId, {
        userId: userId,
        userName: [
          entry.user.firstName,
          entry.user.middleName,
          entry.user.lastName,
        ]
          .filter(Boolean)
          .join(' '),
        email: entry.user.email,
        employeeCode: empCode,
        branchId,
        department: departmentName,
        designation: designationName,
        reportingTo: managerName,
        dailyRecords: [],
        totalWorkingDays: 0,
        presentDays: 0,
        absentDays: 0,
        halfDays: 0,
        onLeaveDays: 0,
        totalWorkingMinutes: 0,
      });
    }

    const userData = userAttendanceMap.get(userId);

    // Format times using existing formatTime function
    const formatTime = (date?: Date): string | null => {
      if (!date) return null;
      const local = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(
        'Asia/Kolkata',
      );
      const hours = local.hour.toString().padStart(2, '0');
      const minutes = local.minute.toString().padStart(2, '0');
      const formattedHour = (local.hour % 12 || 12)
        .toString()
        .padStart(2, '0');
      const suffix = local.hour >= 12 ? 'PM' : 'AM';
      return `${formattedHour}:${minutes} ${suffix}`;
    };

    const workingHours = entry.workingMinutes ? entry.workingMinutes / 60 : 0;

    userData.dailyRecords.push({
      date: entry.attendanceDate,
      status: entry.status,
      inTime: formatTime(entry.inTime),
      outTime: formatTime(entry.outTime),
      workingHours: Math.round(workingHours * 100) / 100,
      isHoliday: holidaySet.has(entry.attendanceDate),
      isSunday: !isWorkingDayForBranch(new Date(entry.attendanceDate), userData.branchId),
    });

    // Count status types
    switch (entry.status) {
      case 'present':
        userData.presentDays++;
        break;
      case 'absent':
        userData.absentDays++;
        break;
      case 'half-day':
        userData.halfDays++;
        break;
      case 'on-leave':
        userData.onLeaveDays++;
        break;
    }

    if (entry.workingMinutes) {
      userData.totalWorkingMinutes += entry.workingMinutes;
    }
  });

  // If ALL users selected, get all unique users using GROUP BY
  if (userIdsString === 'ALL') {
    const allOrgUsers = await this.attendanceRepo
      .createQueryBuilder('att')
      .select('user.user_id', 'userId')
      .addSelect('user.first_name', 'firstName')
      .addSelect('user.middle_name', 'middleName')
      .addSelect('user.last_name', 'lastName')
      .addSelect('user.email', 'email')
      .addSelect('emp.employee_code', 'employeeCode')
      .addSelect('emp.branch_id', 'branchId')
      .addSelect('dept.name', 'departmentName')
      .addSelect('desg.name', 'designationName')
      .addSelect('CONCAT_WS(\' \', NULLIF(managerUser.first_name, \'\'), NULLIF(managerUser.middle_name, \'\'), NULLIF(managerUser.last_name, \'\')) AS "managerFullName"')
      .leftJoin('att.user', 'user')
      .leftJoin(
        'employees',
        'emp',
        'emp.user_id = user.user_id AND emp.organization_id = :organizationId',
        { organizationId },
      )
      .leftJoin('departments', 'dept', 'emp.department_id = dept.id')
      .leftJoin('designations', 'desg', 'emp.designation_id = desg.id')
      // FIXED: Two-step join for manager
      .leftJoin('employees', 'managerEmp', 'managerEmp.id = emp.reporting_to')
      .leftJoin('users', 'managerUser', 'managerUser.user_id = managerEmp.user_id')
      .where('att.organization_id = :organizationId', { organizationId })
      .andWhere('att.attendanceDate BETWEEN :startDate AND :endDate', {
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
      })
      .groupBy('user.user_id')
      .addGroupBy('user.first_name')
      .addGroupBy('user.middle_name')
      .addGroupBy('user.last_name')
      .addGroupBy('user.email')
      .addGroupBy('emp.employee_code')
      .addGroupBy('emp.branch_id')
      .addGroupBy('dept.name')
      .addGroupBy('desg.name')
      .addGroupBy('managerUser.first_name')
      .addGroupBy('managerUser.middle_name')
      .addGroupBy('managerUser.last_name')
      .getRawMany();

    allOrgUsers.forEach((user) => {
      if (!userAttendanceMap.has(user.userId)) {
        let managerName = user.managerFullName || '';
        managerName = managerName.replace(/\s+/g, ' ').trim();

        userAttendanceMap.set(user.userId, {
          userId: user.userId,
          userName: [user.firstName, user.middleName, user.lastName]
            .filter(Boolean)
            .join(' '),
          email: user.email,
          employeeCode: user.employeeCode || 'N/A',
          branchId: user.branchId || null,
          department: user.departmentName || '',
          designation: user.designationName || '',
          reportingTo: managerName,
          dailyRecords: [],
          totalWorkingDays: 0,
          presentDays: 0,
          absentDays: 0,
          halfDays: 0,
          onLeaveDays: 0,
          totalWorkingMinutes: 0,
        });
      }
    });
  }

  // Fill in missing dates for all users (rest of the method remains the same)
  userAttendanceMap.forEach((userData) => {
    userData.totalWorkingDays = allDates.filter((date) => {
      return !holidaySet.has(date) && isWorkingDayForBranch(new Date(date), userData.branchId);
    }).length;
    const existingDates = new Set(userData.dailyRecords.map((r) => r.date));

    allDates.forEach((date) => {
      if (!existingDates.has(date)) {
        const isHoliday = holidaySet.has(date);
        const isSunday = !isWorkingDayForBranch(new Date(date), userData.branchId);
        const isPending = new Date(date) > new Date();

        let status = 'absent';
        if (isPending) status = 'pending';
        else if (isHoliday) status = 'holiday';
        else if (isSunday) status = 'weekend';

        userData.dailyRecords.push({
          date: date,
          status: status,
          inTime: null,
          outTime: null,
          workingHours: 0,
          isHoliday: isHoliday,
          isSunday: isSunday,
        });

        if (!isHoliday && !isSunday && !isPending) {
          userData.absentDays++;
        }
      }
    });

    userData.dailyRecords.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  });

  // Format final report data
  const reportData = Array.from(userAttendanceMap.values()).map((userData) => {
    const totalWorkingHours = userData.totalWorkingMinutes / 60;
    const attendedDays = userData.presentDays + userData.halfDays;
    const attendancePercentage =
      userData.totalWorkingDays > 0
        ? (attendedDays / userData.totalWorkingDays) * 100
        : 0;

    return {
      userId: userData.userId,
      userName: userData.userName,
      email: userData.email,
      employeeCode: userData.employeeCode,
      department: userData.department,
      designation: userData.designation,
      reportingTo: userData.reportingTo,
      totalWorkingDays: userData.totalWorkingDays,
      presentDays: userData.presentDays,
      absentDays: userData.absentDays,
      halfDays: userData.halfDays,
      onLeaveDays: userData.onLeaveDays,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
      averageWorkingHours:
        attendedDays > 0
          ? Math.round((totalWorkingHours / attendedDays) * 100) / 100
          : 0,
      dailyRecords: userData.dailyRecords,
    };
  });

  return {
    reportData,
    summary: {
      totalEmployees: reportData.length,
      period: `${new Date(year, month - 1).toLocaleString('default', {
        month: 'long',
      })} ${year}`,
      workingDays: organizationWorkingDays,
      holidays: holidays.length,
    },
  };
  }

  // ===== Branch Methods =====
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    const normalizedName = this.normalizeBranchName(dto.name);
    if (!normalizedName) {
      throw new BadRequestException('Branch name is required');
    }

    const existingBranches = await this.branchRepo.find({
      where: { organizationId: dto.organizationId },
      select: ['id', 'name'],
    });
    if (
      existingBranches.some(
        (branch) =>
          this.canonicalBranchName(branch.name) ===
          this.canonicalBranchName(normalizedName),
      )
    ) {
      throw new BadRequestException(`Branch "${normalizedName}" already exists`);
    }

    const orgSettings = await this.getOrCreateAttendanceSettings(dto.organizationId);
    const branch = this.branchRepo.create({
      ...dto,
      name: normalizedName,
      workStartTime: dto.workStartTime ?? orgSettings.workStartTime ?? '09:00:00',
      workEndTime: dto.workEndTime ?? orgSettings.workEndTime ?? '18:00:00',
      graceMinutes: dto.graceMinutes ?? orgSettings.graceMinutes ?? 15,
      lateThresholdMinutes: dto.lateThresholdMinutes ?? orgSettings.lateThresholdMinutes ?? 30,
      halfDayCutoffTime: dto.halfDayCutoffTime ?? orgSettings.halfDayCutoffTime ?? '14:00:00',
      workingDays:
        Array.isArray(dto.workingDays) && dto.workingDays.length
          ? dto.workingDays
          : orgSettings.workingDays,
      weekdayOffRules: dto.weekdayOffRules ?? orgSettings.weekdayOffRules ?? {},
      officeLatitude: dto.officeLatitude ?? orgSettings.officeLatitude ?? null,
      officeLongitude: dto.officeLongitude ?? orgSettings.officeLongitude ?? null,
      allowedRadiusMeters: dto.allowedRadiusMeters ?? orgSettings.allowedRadiusMeters ?? 100,
      altLocations: dto.altLocations ?? [],
      isActive: dto.isActive ?? true,
    });
    return this.branchRepo.save(branch);
  }

  async listBranches(organizationId: string): Promise<Branch[]> {
    return this.branchRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateBranch(id: string, dto: UpdateBranchDto): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    
    // Only validate name if it's being changed
    if (dto.name !== undefined) {
      const normalizedName = this.normalizeBranchName(dto.name);
      if (!normalizedName) {
        throw new BadRequestException('Branch name is required');
      }
      const targetCanonicalName = this.canonicalBranchName(normalizedName);
      const currentCanonicalName = this.canonicalBranchName(branch.name);

      // Only check for duplicates if the name is actually changing
      if (targetCanonicalName !== currentCanonicalName) {
        const existingBranches = await this.branchRepo.find({
          where: { organizationId: branch.organizationId },
          select: ['id', 'name'],
        });
        const hasDuplicate = existingBranches.some(
          (item) =>
            item.id !== id &&
            this.canonicalBranchName(item.name) === targetCanonicalName,
        );
        if (hasDuplicate) {
          throw new BadRequestException(`Branch "${normalizedName}" already exists`);
        }
      }
      dto.name = normalizedName;
    }
    
    Object.assign(branch, dto);
    return this.branchRepo.save(branch);
  }

  async deleteBranch(id: string): Promise<void> {
    const result = await this.branchRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
  }

  // ===== Shift Methods =====
  async createShift(dto: CreateShiftDto): Promise<AttendanceShift> {
    const normalizedName = this.normalizeShiftName(dto.name);
    if (!normalizedName) {
      throw new BadRequestException('Shift name is required');
    }

    const existingShifts = await this.shiftRepo.find({
      where: { organizationId: dto.organizationId },
      select: ['id', 'name'],
    });
    if (
      existingShifts.some(
        (shift) =>
          this.canonicalShiftName(shift.name) ===
          this.canonicalShiftName(normalizedName),
      )
    ) {
      throw new BadRequestException(`Shift "${normalizedName}" already exists`);
    }

    const orgSettings = await this.getOrCreateAttendanceSettings(dto.organizationId);
    const shift = this.shiftRepo.create({
      ...dto,
      name: normalizedName,
      description: dto.description?.trim() || null,
      workStartTime: dto.workStartTime ?? orgSettings.workStartTime ?? '09:00:00',
      workEndTime: dto.workEndTime ?? orgSettings.workEndTime ?? '18:00:00',
      graceMinutes: dto.graceMinutes ?? orgSettings.graceMinutes ?? 15,
      lateThresholdMinutes:
        dto.lateThresholdMinutes ?? orgSettings.lateThresholdMinutes ?? 30,
      halfDayCutoffTime:
        dto.halfDayCutoffTime ?? orgSettings.halfDayCutoffTime ?? '14:00:00',
      workingDays:
        Array.isArray(dto.workingDays) && dto.workingDays.length
          ? dto.workingDays
          : orgSettings.workingDays,
      weekdayOffRules: dto.weekdayOffRules ?? orgSettings.weekdayOffRules ?? {},
      isActive: dto.isActive ?? true,
    });

    return this.shiftRepo.save(shift);
  }

  async listShifts(organizationId: string): Promise<AttendanceShift[]> {
    return this.shiftRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateShift(id: string, dto: UpdateShiftDto): Promise<AttendanceShift> {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeShiftName(dto.name);
      if (!normalizedName) {
        throw new BadRequestException('Shift name is required');
      }
      const targetCanonicalName = this.canonicalShiftName(normalizedName);
      const currentCanonicalName = this.canonicalShiftName(shift.name);

      if (targetCanonicalName !== currentCanonicalName) {
        const existingShifts = await this.shiftRepo.find({
          where: { organizationId: shift.organizationId },
          select: ['id', 'name'],
        });
        const hasDuplicate = existingShifts.some(
          (item) =>
            item.id !== id &&
            this.canonicalShiftName(item.name) === targetCanonicalName,
        );
        if (hasDuplicate) {
          throw new BadRequestException(`Shift "${normalizedName}" already exists`);
        }
      }

      dto.name = normalizedName;
    }

    if (dto.description !== undefined) {
      dto.description = dto.description?.trim() || undefined;
    }

    Object.assign(shift, dto);
    return this.shiftRepo.save(shift);
  }

  async deleteShift(id: string): Promise<void> {
    const result = await this.shiftRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }
  }

  // ===== Attendance Settings Methods =====
  
  async getOrCreateAttendanceSettings(organizationId: string): Promise<AttendanceSettings> {
    let settings = await this.attendanceSettingsRepo.findOne({
      where: { organizationId },
    });

    if (!settings) {
      settings = this.attendanceSettingsRepo.create({
        organizationId,
        workStartTime: '09:00:00',
        workEndTime: '18:00:00',
        graceMinutes: 15,
        lateThresholdMinutes: 30,
        allowedRadiusMeters: 100,
        enableGpsValidation: true,
        enableWifiValidation: false,
        enableFaceValidation: true,
        enableCheckinValidation: true,
        enableCheckoutValidation: true,
        halfDayCutoffTime: '14:00:00',
        workingDays: [1, 2, 3, 4, 5, 6],
        weekdayOffRules: {},
      });
      settings = await this.attendanceSettingsRepo.save(settings);
    }

    return settings;
  }

  private resolveWorkingDays(source?: WorkingDayRuleSource): number[] {
    const days = source?.workingDays;
    if (Array.isArray(days) && days.length) {
      return Array.from(
        new Set(
          days.filter(
            (day): day is number =>
              Number.isInteger(day) && day >= 0 && day <= 6,
          ),
        ),
      );
    }
    return [1, 2, 3, 4, 5, 6];
  }

  private resolveWeekdayOffRules(
    source?: WorkingDayRuleSource,
  ): Record<string, number[]> {
    const rules = source?.weekdayOffRules;
    if (!rules || typeof rules !== 'object') return {};
    const normalized: Record<string, number[]> = {};
    Object.entries(rules).forEach(([day, weeks]) => {
      const validDay = Number(day);
      if (!Number.isInteger(validDay) || validDay < 0 || validDay > 6) return;
      if (!Array.isArray(weeks)) return;
      const cleanWeeks = Array.from(
        new Set(
          weeks.filter(
            (week): week is number =>
              Number.isInteger(week) && week >= 1 && week <= 5,
          ),
        ),
      ).sort((a, b) => a - b);
      if (cleanWeeks.length) normalized[String(validDay)] = cleanWeeks;
    });
    return normalized;
  }

  private weekOfMonth(d: Date): number {
    return Math.ceil(d.getDate() / 7);
  }

  private isWorkingDayForDate(d: Date, source: WorkingDayRuleSource): boolean {
    const workingDaySet = new Set(this.resolveWorkingDays(source));
    if (!workingDaySet.has(d.getDay())) return false;
    const week = this.weekOfMonth(d);
    const weekdayRules = this.resolveWeekdayOffRules(source);
    const ruleWeeks = weekdayRules[String(d.getDay())] || [];
    if (ruleWeeks.includes(week)) return false;
    return true;
  }

  async updateAttendanceSettings(
    organizationId: string,
    dto: UpdateAttendanceSettingsDto,
  ): Promise<AttendanceSettings> {
    const settings = await this.getOrCreateAttendanceSettings(organizationId);

    // Strip fields that should not be overwritten
    const { organizationId: _orgId, ...safeDto } = dto as any;
    delete safeDto.id;
    delete safeDto.createdAt;
    delete safeDto.updatedAt;

    // Update only provided fields
    Object.assign(settings, safeDto);

    return this.attendanceSettingsRepo.save(settings);
  }

  async getAttendanceSettings(organizationId: string): Promise<AttendanceSettings> {
    return this.getOrCreateAttendanceSettings(organizationId);
  }
}
