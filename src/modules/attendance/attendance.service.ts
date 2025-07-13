import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DeepPartial, Repository } from 'typeorm';
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
        anomalyFlag: false
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
}
