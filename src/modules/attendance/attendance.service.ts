import { Injectable, NotFoundException } from '@nestjs/common';
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
} from './entities';
import {
  CreateAttendanceLogDto,
  CreateBiometricDeviceDto,
  CreateWifiLocationDto,
  UpdateWifiLocationDto,
  CreateAttendanceSettingsDto,
  UpdateAttendanceSettingsDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto';
import { Common } from '../common/common.service';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, format as formatLocal } from 'date-fns';
import { toZonedTime, format as formatTZ } from 'date-fns-tz';
import { Holiday, LeaveRequest } from '../leave/entities';
import { DateTime } from 'luxon';

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
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
  ) {}

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
    const branchId = shiftConfig.branchId || null;

    // 1️⃣ Upload photo to GCS (optional in dev)
    let photoUrl: string | undefined;
    const gcsUploadDisabled = process.env.GCS_UPLOAD_DISABLED === 'true';
    if (photoFile && !gcsUploadDisabled) {
      const destination = `images/attendance/${userId}/${Date.now()}-${uuidv4()}.jpg`;
      try {
        photoUrl = await this.common.uploadFile(
          photoFile.buffer,
          destination,
          photoFile.mimetype,
          true,
        );
      } catch (error) {
        // Allow attendance to proceed if GCS is unavailable in dev
        console.warn('GCS upload failed, proceeding without photo:', error?.message || error);
        photoUrl = undefined;
      }
    } else if (photoFile && gcsUploadDisabled) {
      console.warn('GCS upload disabled via GCS_UPLOAD_DISABLED; skipping photo upload.');
    }

    // 2️⃣ Determine punch type
    const existingLogs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        timestamp: Between(windowStart, windowEnd),
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
      branch: branchId ? { id: branchId } : undefined,
    };

    const created = this.attendanceLogRepo.create(log);
    const saved = await this.attendanceLogRepo.save(created);

    // 5️⃣ Update attendance summary for the day (ensure dashboard shows data)
    const dayLogs = await this.attendanceLogRepo.find({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
        timestamp: Between(windowStart, windowEnd),
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

      const workingMinutes = Math.floor(
        (+outLog.timestamp - +inLog.timestamp) / 60000,
      );

      const anyAnomaly = sortedLogs.some((l) => l.anomalyFlag);
      const anomalyReason = sortedLogs
        .map((l) => l.anomalyReason)
        .filter(Boolean)
        .join(', ') || undefined;

      const baseData: DeepPartial<Attendance> = {
        user: { id: userId },
        organization: { id: organizationId },
        attendanceDate,
        processedAt: new Date(),
        inTime: inLog.timestamp,
        outTime: outLog.timestamp,
        workingMinutes: Math.max(0, workingMinutes),
        status:
          workingMinutes < 160
            ? 'absent'
            : workingMinutes >= 480
              ? 'present'
              : 'half-day',
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
        anomalyFlag: anyAnomaly,
        anomalyReason,
        branch: branchId ? { id: branchId } : undefined,
      };

      const existingAttendance = await this.attendanceRepo.findOne({
        where: { user: { id: userId }, attendanceDate },
      });
      if (existingAttendance) {
        await this.attendanceRepo.update(existingAttendance.id, baseData);
      } else {
        await this.attendanceRepo.save(this.attendanceRepo.create(baseData));
      }
    }

    // 6️⃣ Respond to frontend
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

  async getAttendanceByDateWithFilters(
    organizationId: string,
    date: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: Attendance['status'] | 'all',
  ) {
    const query = this.attendanceRepo
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.user', 'user')
      .leftJoin(
        'employees',
        'emp',
        'emp.user_id = user.id AND emp.organization_id = :organizationId',
        { organizationId },
      ) // join employees table
      .where('att.organization_id = :organizationId', { organizationId })
      .andWhere('att.attendanceDate = :date', { date });

    if (status && status !== 'all') {
      query.andWhere('att.status = :status', { status });
    }

    if (search) {
      query.andWhere(
        `(user.firstName ILIKE :search OR user.middleName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR emp.employee_code ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    query
      .addSelect([
        'emp.employee_code AS "employeeCode"',
        'emp.photo_url AS "photoUrl"',
      ])
      .orderBy('att.inTime', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

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

    const results = records.map((att, i) => ({
      userId: att.user.id,
      userName: [att.user.firstName, att.user.middleName, att.user.lastName]
        .filter(Boolean)
        .join(' '),
      email: att.user.email,

      employeeCode: raw[i].employeeCode,
      profileImage: raw[i].photoUrl,

      status: att.status,
      workingMinutes: att.workingMinutes ?? 0,

      inTime: formatTime(att.inTime),
      inPhotoUrl: att.inPhotoUrl,
      inLatitude: att.inLatitude,
      inLongitude: att.inLongitude,
      inLocationAddress: att.inLocationAddress,
      inWifiSsid: att.inWifiSsid,
      inWifiBssid: att.inWifiBssid,
      inDeviceInfo: att.inDeviceInfo,

      outTime: formatTime(att.outTime),
      outPhotoUrl: att.outPhotoUrl,
      outLatitude: att.outLatitude,
      outLongitude: att.outLongitude,
      outLocationAddress: att.outLocationAddress,
      outWifiSsid: att.outWifiSsid,
      outWifiBssid: att.outWifiBssid,
      outDeviceInfo: att.outDeviceInfo,

      anomalyFlag: att.anomalyFlag,
      anomalyReason: att.anomalyReason,
    }));

    return {
      results,
      pagination: {
        total: rawResults.entities.length,
        page,
        limit,
        totalPages: Math.ceil(rawResults.entities.length / limit),
      },
    };
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
        (a) => a.status === 'present' || a.status === 'half-day',
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
        absent: attendance.filter((a) => a.status === 'absent').length,
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

    // Check if the Attendance summary has timeslip-corrected times
    const dateStr = formatLocal(new Date(), 'yyyy-MM-dd');
    const attendanceSummary = await this.attendanceRepo.findOne({
      where: { user: { id: userId }, attendanceDate: dateStr },
    });

    // Prefer corrected inTime/outTime from the Attendance record (set by timeslip approval)
    const punchInTime = attendanceSummary?.inTime ?? (logs.length > 0 ? logs[0].timestamp : null);
    const lastPunch = attendanceSummary?.outTime ?? (logs.length > 0 ? logs[logs.length - 1].timestamp : null);

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

    const settings = await this.getOrCreateAttendanceSettings(organizationId);
    const isWorkingDay = (d: Date) => this.isWorkingDayForDate(d, settings);

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

      const attendanceEntry = attendanceMap.get(dateStr);
      const logInfo = logMap.get(dateStr);

      let status: Attendance['status'] | 'absent' | 'pending' =
        attendanceEntry?.status ?? (d > yesterday ? 'pending' : 'absent');

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

  private combineDateTime(base: Date, timeStr: string): Date {
    const [hh, mm, ss] = timeStr.split(':').map((t) => parseInt(t, 10));
    const dt = new Date(base);
    dt.setHours(hh || 0, mm || 0, ss || 0, 0);
    return dt;
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

  private async resolveShiftConfig(organizationId: string, userId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      relations: ['branch'],
    });

    if (employee?.branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: employee.branchId, organizationId: organizationId, isActive: true },
      });
      if (branch) {
        return {
          branchId: branch.id,
          workStartTime: branch.workStartTime,
          workEndTime: branch.workEndTime,
          graceMinutes: branch.graceMinutes,
          lateThresholdMinutes: branch.lateThresholdMinutes,
        };
      }
    }

    const settings = await this.getOrCreateAttendanceSettings(organizationId);
    return {
      branchId: null,
      workStartTime: settings.workStartTime,
      workEndTime: settings.workEndTime,
      graceMinutes: settings.graceMinutes,
      lateThresholdMinutes: settings.lateThresholdMinutes,
    };
  }

  async generateDailyAttendanceSummary(date: Date = new Date()): Promise<void> {
    const start = startOfDay(date);
    const end = endOfDay(date);
    const dateStr = formatLocal(start, 'yyyy-MM-dd');

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

      // 💼 If on leave
      if (leave) {
        baseData.status = 'on-leave';
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

        Object.assign(baseData, {
          inTime: inLog.timestamp,
          outTime: outLog.timestamp,
          workingMinutes,
          status:
            workingMinutes < 160
              ? 'absent'
              : workingMinutes >= 480
                ? 'present'
                : 'half-day',
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
    const isWorkingDay = (d: Date) => this.isWorkingDayForDate(d, settings);

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
  const workingDays = allDates.filter((date) => {
    return isWorkingDay(new Date(date)) && !holidaySet.has(date);
  }).length;

  // Group attendance records by user
  const userAttendanceMap = new Map();

  // Process raw results to build user map
  rawResults.entities.forEach((entry, index) => {
    const userId = entry.user.id;
    const rawData = rawResults.raw[index];
    const empCode = rawData?.employeeCode || 'N/A';
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
        department: departmentName,
        designation: designationName,
        reportingTo: managerName,
        dailyRecords: [],
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
      isSunday: !isWorkingDay(new Date(entry.attendanceDate)),
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
          department: user.departmentName || '',
          designation: user.designationName || '',
          reportingTo: managerName,
          dailyRecords: [],
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
    const existingDates = new Set(userData.dailyRecords.map((r) => r.date));

    allDates.forEach((date) => {
      if (!existingDates.has(date)) {
        const isHoliday = holidaySet.has(date);
        const isSunday = !isWorkingDay(new Date(date));
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
      workingDays > 0 ? (attendedDays / workingDays) * 100 : 0;

    return {
      userId: userData.userId,
      userName: userData.userName,
      email: userData.email,
      employeeCode: userData.employeeCode,
      department: userData.department,
      designation: userData.designation,
      reportingTo: userData.reportingTo,
      totalWorkingDays: workingDays,
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
      workingDays,
      holidays: holidays.length,
    },
  };
  }

  // ===== Branch Methods =====
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    const branch = this.branchRepo.create(dto);
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
    Object.assign(branch, dto);
    return this.branchRepo.save(branch);
  }

  async deleteBranch(id: string): Promise<void> {
    const result = await this.branchRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
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

  private resolveWorkingDays(settings?: AttendanceSettings): number[] {
    const days = settings?.workingDays;
    if (Array.isArray(days) && days.length) return days;
    return [1, 2, 3, 4, 5, 6];
  }

  private resolveWeekdayOffRules(
    settings?: AttendanceSettings,
  ): Record<string, number[]> {
    const rules = settings?.weekdayOffRules;
    if (rules && typeof rules === 'object') return rules;
    return {};
  }

  private weekOfMonth(d: Date): number {
    return Math.ceil(d.getDate() / 7);
  }

  private isWorkingDayForDate(d: Date, settings: AttendanceSettings): boolean {
    const workingDaySet = new Set(this.resolveWorkingDays(settings));
    if (!workingDaySet.has(d.getDay())) return false;
    const week = this.weekOfMonth(d);
    const weekdayRules = this.resolveWeekdayOffRules(settings);
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
