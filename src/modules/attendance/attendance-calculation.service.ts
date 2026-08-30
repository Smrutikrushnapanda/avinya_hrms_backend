import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Attendance } from './entities/attendance.entity';

/**
 * Shift-rule source — the minimum fields needed for status calculation.
 * Implemented by AttendanceSettings, Branch, and AttendanceShift entities.
 */
export type ShiftRuleSource = {
  workStartTime: string;
  workEndTime: string;
  halfDayCutoffTime?: string | null;
  graceMinutes?: number | null;
  lateThresholdMinutes?: number | null;
  timezone?: string;
};

/**
 * Authoritative attendance-status calculation.
 *
 * This is the SINGLE source of truth for converting effective punch times +
 * shift configuration into an attendance status. Both the AttendanceService
 * (logAttendance, generateDailyAttendanceSummary) and the TimeslipService
 * (applyTimeslipToAttendance) must use this service — never inline their own
 * status logic.
 *
 * This service is intentionally stateless: it has NO database access, NO
 * repository injections, and NO side effects. Every method is pure
 * computation based on its inputs.
 */
@Injectable()
export class AttendanceCalculationService {
  // ── Status determination ──────────────────────────────────────────────

  /**
   * Determine attendance status from effective punch data and shift config.
   *
   * Rules (in priority order):
   * 1. No clock-out yet → 'present' (or 'late' if late check-in)
   * 2. Worked >= full shift → 'present' (or 'late' if late check-in)
   * 3. Worked >= half-day threshold → 'half-day'
   * 4. Otherwise → 'absent'
   */
  determineAttendanceStatus(
    workingMinutes: number,
    hasClockOut: boolean,
    config: ShiftRuleSource,
    inTime?: Date | null,
  ): Attendance['status'] {
    const isLateCheckIn = inTime
      ? this.isLatePunchIn(new Date(inTime), config)
      : false;

    if (!hasClockOut) {
      return isLateCheckIn ? 'late' : 'present';
    }

    const fullShiftMinutes = this.calculateShiftDurationMinutes(
      config.workStartTime,
      config.workEndTime,
    );
    const halfDayThreshold = this.calculateHalfDayThresholdMinutes(config);

    if (workingMinutes >= fullShiftMinutes) {
      return isLateCheckIn ? 'late' : 'present';
    }
    if (workingMinutes >= halfDayThreshold) {
      return 'half-day';
    }
    return 'absent';
  }

  /**
   * Fallback status determination when no shift config is available.
   * Uses simple thresholds: 480 min = full day, 160 min = half day.
   * Correctly handles the no-clock-out case (present/late).
   */
  determineAttendanceStatusFallback(
    workingMinutes: number,
    hasClockOut: boolean,
    inTime?: Date | null,
  ): Attendance['status'] {
    if (!hasClockOut) {
      return 'present';
    }
    if (workingMinutes >= 480) return 'present';
    if (workingMinutes >= 160) return 'half-day';
    return 'absent';
  }

  // ── Effective punch resolution ────────────────────────────────────────

  /**
   * Resolve effective punch times from raw attendance logs + approved
   * timeslip corrections.
   *
   * This is the canonical way to compute "effective in / effective out"
   * given raw punch logs and any approved timeslip overrides.
   *
   * @param sortedPunchLogs - Non-anomalous check-in/check-out logs sorted by timestamp ASC
   * @param approvedTimeslipCorrectedIn - Approved timeslip corrected_in (or null)
   * @param approvedTimeslipCorrectedOut - Approved timeslip corrected_out (or null)
   * @param approvedTimeslipMissingType - The timeslip's missing_type ('IN' | 'OUT' | 'BOTH')
   */
  resolveEffectivePunches(sortedPunchLogs: { timestamp: Date; type: string }[], approvedTimeslipCorrectedIn: Date | null, approvedTimeslipCorrectedOut: Date | null, approvedTimeslipMissingType: 'IN' | 'OUT' | 'BOTH' | null): {
    effectiveIn: Date | null;
    effectiveOut: Date | null;
    hasClockOut: boolean;
  } {
    const inLog = sortedPunchLogs[0]?.timestamp ?? null;
    const lastLog = sortedPunchLogs[sortedPunchLogs.length - 1]?.timestamp ?? null;

    // Determine raw clock-out existence: more than one punch AND last is check-out
    const rawLogsOnly = sortedPunchLogs.filter(
      (l) => l.type === 'check-in' || l.type === 'check-out',
    );
    const hasRawClockOut = rawLogsOnly.length > 1;

    let effectiveIn = inLog;
    let effectiveOut = hasRawClockOut ? lastLog : null;
    let hasClockOut = hasRawClockOut;

    // Apply timeslip corrections
    if (approvedTimeslipMissingType) {
      if (
        (approvedTimeslipMissingType === 'IN' ||
          approvedTimeslipMissingType === 'BOTH') &&
        approvedTimeslipCorrectedIn
      ) {
        effectiveIn = approvedTimeslipCorrectedIn;
      }
      if (
        (approvedTimeslipMissingType === 'OUT' ||
          approvedTimeslipMissingType === 'BOTH') &&
        approvedTimeslipCorrectedOut
      ) {
        effectiveOut = approvedTimeslipCorrectedOut;
        hasClockOut = true;
      }
    }

    return { effectiveIn, effectiveOut, hasClockOut };
  }

  /**
   * Calculate working minutes from effective in/out times.
   * Returns 0 if either time is missing.
   */
  calculateWorkingMinutes(effectiveIn: Date | null, effectiveOut: Date | null): number {
    if (!effectiveIn || !effectiveOut) return 0;
    let diffMs = +effectiveOut - +effectiveIn;
    if (diffMs < 0) {
      diffMs += 24 * 60 * 60 * 1000; // overnight shift
    }
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  // ── Shift math ────────────────────────────────────────────────────────

  /**
   * Total required work minutes for a full shift.
   */
  calculateShiftDurationMinutes(
    workStartTime: string,
    workEndTime: string,
  ): number {
    const start = this.parseTimeToMinutes(workStartTime);
    const end = this.parseTimeToMinutes(workEndTime);
    let diff = end - start;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }

  /**
   * Minimum minutes to qualify as half-day (instead of absent).
   * Derived from halfDayCutoffTime or defaults to half of full shift.
   */
  calculateHalfDayThresholdMinutes(config: ShiftRuleSource): number {
    const fullShiftMinutes = this.calculateShiftDurationMinutes(
      config.workStartTime,
      config.workEndTime,
    );
    const start = this.parseTimeToMinutes(config.workStartTime);
    const cutoff =
      typeof config.halfDayCutoffTime === 'string' &&
      config.halfDayCutoffTime.trim()
        ? this.parseTimeToMinutes(config.halfDayCutoffTime)
        : start + Math.floor(fullShiftMinutes / 2);

    let threshold = cutoff - start;
    if (threshold <= 0) threshold += 24 * 60;
    if (threshold > fullShiftMinutes) threshold = fullShiftMinutes;
    return Math.max(1, threshold);
  }

  /**
   * True if the employee's check-in time is after the grace-period cutoff.
   */
  isLatePunchIn(inTime: Date, config: ShiftRuleSource): boolean {
    const tz = config.timezone || 'Asia/Kolkata';
    const { windowStart } = this.computeShiftWindow(
      inTime,
      config.workStartTime,
      config.workEndTime,
      tz,
    );
    const lateAfterRaw =
      config.graceMinutes ?? config.lateThresholdMinutes ?? 0;
    const lateAfterMinutes = Number(lateAfterRaw);
    const safeLateAfter = Math.max(0, lateAfterMinutes);
    const lateCutoff = new Date(
      windowStart.getTime() + safeLateAfter * 60_000,
    );
    return inTime.getTime() > lateCutoff.getTime();
  }

  // ── Shift window / date computation ───────────────────────────────────

  /**
   * Compute the shift window (start/end in UTC) and the attendance date
   * string for a given punch time.
   *
   * Handles overnight shifts and pre-dawn punches correctly.
   */
  computeShiftWindow(
    punchTime: Date,
    workStartTime: string,
    workEndTime: string,
    timezone = 'Asia/Kolkata',
  ): { windowStart: Date; windowEnd: Date; attendanceDate: string } {
    const windowStart = this.combineDateTime(
      punchTime,
      workStartTime,
      timezone,
    );
    const windowEnd = this.combineDateTime(punchTime, workEndTime, timezone);
    const crossesMidnight = windowEnd <= windowStart;

    if (crossesMidnight) {
      windowEnd.setDate(windowEnd.getDate() + 1);
      if (punchTime < windowStart) {
        windowStart.setDate(windowStart.getDate() - 1);
        windowEnd.setDate(windowEnd.getDate() - 1);
      }
    }

    const attendanceDate = DateTime.fromJSDate(windowStart)
      .setZone(timezone)
      .toFormat('yyyy-MM-dd');
    return { windowStart, windowEnd, attendanceDate };
  }

  /**
   * Combine a base date with a time string in the given timezone,
   * returning a UTC Date.
   */
  combineDateTime(
    base: Date,
    timeStr: string,
    timezone = 'Asia/Kolkata',
  ): Date {
    const [hh, mm, ss] = timeStr.split(':').map((t) => parseInt(t, 10));
    const zoned = DateTime.fromJSDate(base).setZone(timezone);
    const combined = zoned.set({
      hour: hh || 0,
      minute: mm || 0,
      second: ss || 0,
      millisecond: 0,
    });
    return combined.toUTC().toJSDate();
  }

  /**
   * Parse a HH:mm:ss or HH:mm time string into total minutes from midnight.
   */
  parseTimeToMinutes(timeStr: string): number {
    const [hh, mm] = timeStr.split(':').map((t) => parseInt(t, 10));
    const safeH = Number.isFinite(hh) ? hh : 0;
    const safeM = Number.isFinite(mm) ? mm : 0;
    return safeH * 60 + safeM;
  }

  /**
   * True if the shift crosses midnight (end <= start).
   */
  isOvernightShift(workStartTime: string, workEndTime: string): boolean {
    return (
      this.parseTimeToMinutes(workEndTime) <=
      this.parseTimeToMinutes(workStartTime)
    );
  }

  /**
   * Get day bounds (start/end in UTC) for a reference date in the given timezone.
   */
  getDayBoundsInZone(
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
}
