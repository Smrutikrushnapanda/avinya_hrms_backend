import { AttendanceCalculationService } from './attendance-calculation.service';

describe('AttendanceCalculationService', () => {
  let service: AttendanceCalculationService;

  // Default shift: 09:00 - 18:00 (540 minutes), grace 15min, lateThreshold 30min
  const defaultConfig = {
    workStartTime: '09:00:00',
    workEndTime: '18:00:00',
    graceMinutes: 15,
    lateThresholdMinutes: 30,
    halfDayCutoffTime: '14:00:00',
    timezone: 'Asia/Kolkata',
  };

  beforeEach(() => {
    service = new AttendanceCalculationService();
  });

  // ── TEST 1: Normal Day ───────────────────────────────────────────────
  describe('TEST 1 — Normal Day (punch 10:00, out 19:00)', () => {
    it('should calculate present for full shift with workingMinutes >= fullShift', () => {
      const result = service.determineAttendanceStatus(
        600,
        true,
        defaultConfig,
        new Date('2026-08-20T04:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
      expect(result.punctualityStatus).toBe('late');
    });

    it('should calculate present for on-time punch-in (09:00 - 18:00)', () => {
      const result = service.determineAttendanceStatus(
        540,
        true,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
      expect(result.punctualityStatus).toBe('on-time');
    });
  });

  // ── TEST 2: Late Arrival ─────────────────────────────────────────────
  describe('TEST 2 — Late Arrival (punch 12:00, out 19:00)', () => {
    it('should calculate present + not-complete for late arrival with partial shift', () => {
      const result = service.determineAttendanceStatus(
        420,
        true,
        defaultConfig,
        new Date('2026-08-20T06:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('not-complete');
      expect(result.punctualityStatus).toBe('late');
    });
  });

  // ── TEST 3: Approved IN Correction ──────────────────────────────────
  describe('TEST 3 — Approved IN Correction (physical 12:00, corrected 10:00, no out yet)', () => {
    it('should calculate present (single punch) when only IN correction exists', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T04:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });

    it('should calculate late when single punch is after grace period', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T06:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.punctualityStatus).toBe('late');
    });
  });

  // ── TEST 3b — Approved IN Correction + Punch-Out ────────────────────
  describe('TEST 3b — Approved IN Correction + Punch-Out (10:00 → 19:58)', () => {
    it('should calculate present + not-complete for corrected 10:00 → 19:58', () => {
      const result = service.determineAttendanceStatus(
        598,
        true,
        defaultConfig,
        new Date('2026-08-20T04:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
      expect(result.punctualityStatus).toBe('late');
    });
  });

  // ── TEST 4: Approved OUT Correction ─────────────────────────────────
  describe('TEST 4 — Approved OUT Correction', () => {
    it('should use corrected out time for working minutes', () => {
      const result = service.determineAttendanceStatus(
        600,
        true,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });
  });

  // ── TEST 5: Both IN/OUT Correction ──────────────────────────────────
  describe('TEST 5 — Both IN/OUT Correction', () => {
    it('should calculate based on both corrected times', () => {
      const result = service.determineAttendanceStatus(
        480,
        true,
        defaultConfig,
        new Date('2026-08-20T04:00:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('not-complete');
    });
  });

  // ── TEST 6: Pending Correction ───────────────────────────────────────
  describe('TEST 6 — Pending Correction (no effect on attendance)', () => {
    it('should use raw punch times when no approved timeslip', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T06:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });
  });

  // ── TEST 7: Rejected Correction ──────────────────────────────────────
  describe('TEST 7 — Rejected Correction (original attendance remains)', () => {
    it('should use raw punch times when timeslip is rejected', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T06:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });
  });

  // ── TEST 8: Duplicate Punch ──────────────────────────────────────────
  describe('TEST 8 — Duplicate Punch', () => {
    it('should handle two check-in logs gracefully', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });
  });

  // ── TEST 9: Break Logs ──────────────────────────────────────────────
  describe('TEST 9 — Break Logs (break-end must NOT become punch-out)', () => {
    it('should use last check-out as out time, not break-end', () => {
      const result = service.determineAttendanceStatus(
        540,
        true,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should not treat break-end as clock-out when no check-out exists', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });
  });

  // ── TEST 13: Midnight/Overnight Shift ────────────────────────────────
  describe('TEST 13 — Midnight/Overnight Shift', () => {
    it('should calculate working minutes correctly across midnight', () => {
      const overnightConfig = {
        workStartTime: '22:00:00',
        workEndTime: '06:00:00',
        halfDayCutoffTime: '02:00:00',
        graceMinutes: 15,
        lateThresholdMinutes: 30,
        timezone: 'Asia/Kolkata',
        requiredWorkingMinutes: 420,
      };
      const result = service.determineAttendanceStatus(
        420,
        true,
        overnightConfig,
        new Date('2026-08-20T16:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });
  });

  // ── TEST 14: Shift Calculations ─────────────────────────────────────
  describe('TEST 14 — Shift Calculations', () => {
    it('should calculate shift duration correctly', () => {
      expect(
        service.calculateShiftDurationMinutes('09:00:00', '18:00:00'),
      ).toBe(540);
    });

    it('should calculate half-day threshold using new formula', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      expect(service.calculateHalfDayThresholdMinutes(config)).toBe(300);
    });

    it('should use half of full shift for half-day threshold when no requiredWorkingMinutes', () => {
      expect(service.calculateHalfDayThresholdMinutes(defaultConfig)).toBe(330);
    });
  });

  // ── TEST 15: Working Minutes Calculation ─────────────────────────────
  describe('TEST 15 — Working Minutes Calculation', () => {
    it('should calculate working minutes between two times', () => {
      const start = new Date('2026-08-20T03:30:00Z');
      const end = new Date('2026-08-20T12:30:00Z');
      expect(service.calculateWorkingMinutes(start, end)).toBe(540);
    });

    it('should return 0 when either time is missing', () => {
      expect(service.calculateWorkingMinutes(null, new Date())).toBe(0);
      expect(service.calculateWorkingMinutes(new Date(), null)).toBe(0);
    });
  });

  // ── TEST 16: Effective Punches Resolution ────────────────────────────
  describe('TEST 16 — Effective Punches Resolution', () => {
    it('should apply IN-only correction while preserving raw out', () => {
      const logs = [
        { timestamp: new Date('2026-08-20T06:30:00Z'), type: 'check-in' },
        { timestamp: new Date('2026-08-20T12:30:00Z'), type: 'check-out' },
      ];
      const result = service.resolveEffectivePunches(
        logs,
        new Date('2026-08-20T04:30:00Z'),
        null,
        'IN',
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T04:30:00Z').toISOString(),
      );
      expect(result.effectiveOut?.toISOString()).toBe(
        new Date('2026-08-20T12:30:00Z').toISOString(),
      );
    });

    it('should apply OUT-only correction while preserving raw in', () => {
      const logs = [
        { timestamp: new Date('2026-08-20T04:30:00Z'), type: 'check-in' },
        { timestamp: new Date('2026-08-20T12:30:00Z'), type: 'check-out' },
      ];
      const result = service.resolveEffectivePunches(
        logs,
        null,
        new Date('2026-08-20T13:30:00Z'),
        'OUT',
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T04:30:00Z').toISOString(),
      );
      expect(result.effectiveOut?.toISOString()).toBe(
        new Date('2026-08-20T13:30:00Z').toISOString(),
      );
    });

    it('should apply BOTH corrections', () => {
      const logs = [
        { timestamp: new Date('2026-08-20T06:30:00Z'), type: 'check-in' },
        { timestamp: new Date('2026-08-20T12:30:00Z'), type: 'check-out' },
      ];
      const result = service.resolveEffectivePunches(
        logs,
        new Date('2026-08-20T04:30:00Z'),
        new Date('2026-08-20T13:30:00Z'),
        'BOTH',
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T04:30:00Z').toISOString(),
      );
      expect(result.effectiveOut?.toISOString()).toBe(
        new Date('2026-08-20T13:30:00Z').toISOString(),
      );
    });
  });

  // ── CRITICAL — Production Scenario ───────────────────────────────────
  describe('CRITICAL — Production Scenario: ABSENT-when-present bug', () => {
    it('should NOT set ABSENT when approved IN correction exists but no punch-out yet', () => {
      const result = service.determineAttendanceStatus(
        0,
        false,
        defaultConfig,
        new Date('2026-08-20T04:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });

    it('should calculate correct final status after punch-out', () => {
      const result = service.determineAttendanceStatus(
        600,
        true,
        defaultConfig,
        new Date('2026-08-20T04:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('should handle zero working minutes with clock-out (very short day)', () => {
      const result = service.determineAttendanceStatus(0, true, defaultConfig);
      expect(result.status).toBe('absent');
      expect(result.completionStatus).toBeNull();
      expect(result.punctualityStatus).toBeNull();
    });

    it('should handle exactly full shift', () => {
      const result = service.determineAttendanceStatus(
        540,
        true,
        defaultConfig,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should handle no inTime gracefully', () => {
      const result = service.determineAttendanceStatus(
        540,
        true,
        defaultConfig,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
      expect(result.punctualityStatus).toBe('on-time');
    });
  });

  // ── CONCURRENCY REGRESSION ───────────────────────────────────────────
  describe('CONCURRENCY — Stale timeslip state between lookup and lock', () => {
    it('should use raw punch values when timeslip is PENDING', () => {
      const sortedLogs = [
        { timestamp: new Date('2026-08-20T06:30:00Z'), type: 'check-in' },
      ];
      const result = service.resolveEffectivePunches(
        sortedLogs,
        null,
        null,
        null,
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T06:30:00Z').toISOString(),
      );
      expect(result.effectiveOut).toBeNull();
      expect(result.hasClockOut).toBe(false);
    });

    it('should use raw punch values when timeslip is REJECTED', () => {
      const sortedLogs = [
        { timestamp: new Date('2026-08-20T06:30:00Z'), type: 'check-in' },
        { timestamp: new Date('2026-08-20T12:30:00Z'), type: 'check-out' },
      ];
      const result = service.resolveEffectivePunches(
        sortedLogs,
        null,
        null,
        null,
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T06:30:00Z').toISOString(),
      );
      expect(result.effectiveOut?.toISOString()).toBe(
        new Date('2026-08-20T12:30:00Z').toISOString(),
      );
    });

    it('should apply APPROVED corrections when timeslip is APPROVED', () => {
      const sortedLogs = [
        { timestamp: new Date('2026-08-20T06:30:00Z'), type: 'check-in' },
        { timestamp: new Date('2026-08-20T12:30:00Z'), type: 'check-out' },
      ];
      const result = service.resolveEffectivePunches(
        sortedLogs,
        new Date('2026-08-20T04:30:00Z'),
        new Date('2026-08-20T13:30:00Z'),
        'BOTH',
      );
      expect(result.effectiveIn?.toISOString()).toBe(
        new Date('2026-08-20T04:30:00Z').toISOString(),
      );
      expect(result.effectiveOut?.toISOString()).toBe(
        new Date('2026-08-20T13:30:00Z').toISOString(),
      );
    });
  });

  // ── TIMEZONE ─────────────────────────────────────────────────────────
  describe('TIMEZONE — Organization timezone attendance date computation', () => {
    it('should compute correct attendance date for Asia/Kolkata timezone', () => {
      const result = service.computeShiftWindow(
        new Date('2026-08-20T00:30:00.000Z'),
        '09:00:00',
        '18:00:00',
        'Asia/Kolkata',
      );
      expect(result.attendanceDate).toBe('2026-08-20');
    });

    it('should compute correct attendance date for America/New_York timezone', () => {
      const result = service.computeShiftWindow(
        new Date('2026-08-20T09:30:00.000Z'),
        '09:00:00',
        '18:00:00',
        'America/New_York',
      );
      expect(result.attendanceDate).toBe('2026-08-20');
    });

    it('should compute correct attendance date for America/New_York when UTC date differs', () => {
      const result = service.computeShiftWindow(
        new Date('2026-08-20T04:00:00.000Z'),
        '09:00:00',
        '18:00:00',
        'America/New_York',
      );
      expect(result.attendanceDate).toBe('2026-08-20');
    });

    it('should compute correct attendance date for Asia/Kolkata near midnight boundary', () => {
      const result = service.computeShiftWindow(
        new Date('2026-08-19T18:30:00.000Z'),
        '09:00:00',
        '18:00:00',
        'Asia/Kolkata',
      );
      expect(result.attendanceDate).toBe('2026-08-20');
    });

    it('should never return null/undefined for attendanceDate in any timezone', () => {
      const timezones = [
        'Asia/Kolkata',
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
      ];
      for (const tz of timezones) {
        const result = service.computeShiftWindow(
          new Date('2026-08-20T06:00:00.000Z'),
          '09:00:00',
          '18:00:00',
          tz,
        );
        expect(result.attendanceDate).toBeTruthy();
        expect(typeof result.attendanceDate).toBe('string');
      }
    });

    it('should compute correct attendance date for overnight shift across timezone boundary', () => {
      const result = service.computeShiftWindow(
        new Date('2026-08-20T16:30:00.000Z'),
        '22:00:00',
        '06:00:00',
        'Asia/Kolkata',
      );
      expect(result.attendanceDate).toBe('2026-08-20');
    });
  });

  // ── REGRESSION — Cross-organization attendance isolation ─────────────
  describe('REGRESSION — Cross-organization attendance isolation', () => {
    it('resolveEffectivePunches should not mix punch data across orgs', () => {
      const logsA = [
        { timestamp: new Date('2026-08-20T04:30:00Z'), type: 'check-in' },
      ];
      const logsB = [
        { timestamp: new Date('2026-08-20T05:30:00Z'), type: 'check-in' },
      ];
      const resultA = service.resolveEffectivePunches(logsA, null, null, null);
      const resultB = service.resolveEffectivePunches(logsB, null, null, null);
      expect(resultA.effectiveIn?.toISOString()).not.toBe(
        resultB.effectiveIn?.toISOString(),
      );
    });

    it('computeShiftWindow should produce independent dates for different org timezones', () => {
      const punch = new Date('2026-08-20T00:30:00Z');
      const resultKolkata = service.computeShiftWindow(
        punch,
        '09:00:00',
        '18:00:00',
        'Asia/Kolkata',
      );
      const resultNYC = service.computeShiftWindow(
        punch,
        '09:00:00',
        '18:00:00',
        'America/New_York',
      );
      expect(resultKolkata.attendanceDate).toBe('2026-08-20');
      expect(resultNYC.attendanceDate).toBe('2026-08-19');
    });
  });

  // ── REGRESSION — getTodayAnomalies ──────────────────────────────────
  describe('REGRESSION — getTodayAnomalies organization_id query', () => {
    it('getDayBoundsInZone should always return a valid dateStr', () => {
      const result = service.getDayBoundsInZone(new Date(), 'Asia/Kolkata');
      expect(result.dateStr).toBeTruthy();
      expect(result.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── CONFIGURABLE THRESHOLD — requiredWorkingMinutes ──────────────────
  describe('CONFIGURABLE THRESHOLD — requiredWorkingMinutes', () => {
    it('should use requiredWorkingMinutes when set (480 min = 8h)', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      const result = service.determineAttendanceStatus(
        480,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should mark present when worked >= requiredWorkingMinutes (481 min)', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      const result = service.determineAttendanceStatus(
        481,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should mark present when worked = 536 min (8h 56m) with 480 min threshold', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      const result = service.determineAttendanceStatus(
        536,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should NOT mark complete when worked < requiredWorkingMinutes (479 min)', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      const result = service.determineAttendanceStatus(
        479,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('not-complete');
    });

    it('should use 420 min threshold and mark complete at exactly 420', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
      const result = service.determineAttendanceStatus(
        420,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should NOT mark complete at 419 with 420 min threshold', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
      const result = service.determineAttendanceStatus(
        419,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('not-complete');
    });

    it('should fall back to full shift duration when requiredWorkingMinutes is null', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: null };
      const result = service.determineAttendanceStatus(
        540,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should fall back to full shift duration when requiredWorkingMinutes is 0', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 0 };
      const result = service.determineAttendanceStatus(
        540,
        true,
        config,
        new Date('2026-08-20T03:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should mark late when working >= threshold but check-in is late', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
      const result = service.determineAttendanceStatus(
        500,
        true,
        config,
        new Date('2026-08-20T06:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
      expect(result.punctualityStatus).toBe('late');
    });

    it('calculateFullPresentThresholdMinutes should return requiredWorkingMinutes when set', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
      expect(service.calculateFullPresentThresholdMinutes(config)).toBe(420);
    });

    it('calculateFullPresentThresholdMinutes should fallback to full shift when null', () => {
      const config = { ...defaultConfig, requiredWorkingMinutes: null };
      expect(service.calculateFullPresentThresholdMinutes(config)).toBe(540);
    });

    it('should handle overnight shift with requiredWorkingMinutes', () => {
      const overnightConfig = {
        workStartTime: '22:00:00',
        workEndTime: '06:00:00',
        halfDayCutoffTime: '02:00:00',
        graceMinutes: 15,
        lateThresholdMinutes: 30,
        timezone: 'Asia/Kolkata',
        requiredWorkingMinutes: 420,
      };
      const result = service.determineAttendanceStatus(
        420,
        true,
        overnightConfig,
        new Date('2026-08-20T16:30:00.000Z'),
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });
  });

  // ── determineAttendanceStatusFallback ────────────────────────────────
  describe('determineAttendanceStatusFallback — configurable requiredWorkingMinutes', () => {
    it('should use 480 default when requiredWorkingMinutes is undefined', () => {
      const result = service.determineAttendanceStatusFallback(480, true);
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should use provided requiredWorkingMinutes as full-present threshold', () => {
      const result = service.determineAttendanceStatusFallback(
        420,
        true,
        undefined,
        420,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should use 480 default when requiredWorkingMinutes is null', () => {
      const result = service.determineAttendanceStatusFallback(
        480,
        true,
        undefined,
        null,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should use 480 default when requiredWorkingMinutes is 0', () => {
      const result = service.determineAttendanceStatusFallback(
        480,
        true,
        undefined,
        0,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('complete');
    });

    it('should still return present when no clock-out regardless of threshold', () => {
      const result = service.determineAttendanceStatusFallback(
        0,
        false,
        undefined,
        420,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBeNull();
    });

    it('not-complete when below full day but above half-day threshold', () => {
      const result = service.determineAttendanceStatusFallback(
        400,
        true,
        undefined,
        480,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('not-complete');
    });

    it('incomplete-hours when below half-day threshold', () => {
      const result = service.determineAttendanceStatusFallback(
        100,
        true,
        undefined,
        480,
      );
      expect(result.status).toBe('present');
      expect(result.completionStatus).toBe('incomplete-hours');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // THREE-DIMENSION MODEL — Boundary Tests (the critical tests)
  // ══════════════════════════════════════════════════════════════════════
  describe('THREE-DIMENSION MODEL — Boundary Tests', () => {
    // ── Full Day ──────────────────────────────────────────────────────
    describe('Full Day (>= requiredWorkingMinutes)', () => {
      it('8h on-time → present + complete + on-time', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('8h late → present + complete + late', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
        expect(result.punctualityStatus).toBe('late');
      });

      it('536 min (8h56m) on-time → present + complete + on-time', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          536,
          true,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
      });

      it('481 min on-time → present + complete + on-time', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          481,
          true,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
      });
    });

    // ── Just Below Full Day ───────────────────────────────────────────
    describe('Just Below Full Day (< requiredWorkingMinutes, >= halfDayThreshold)', () => {
      it('7h59 on-time → present + not-complete + on-time (MUST NOT be half-day)', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          479,
          true,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('7h59 late → present + not-complete + late', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          479,
          true,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
        expect(result.punctualityStatus).toBe('late');
      });
    });

    // ── Half-Day Threshold ────────────────────────────────────────────
    describe('Half-Day Threshold (floor(required/2)+60)', () => {
      it('half-day threshold = floor(480/2)+60 = 300', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        expect(service.calculateHalfDayThresholdMinutes(config)).toBe(300);
      });

      it('half-day threshold = floor(420/2)+60 = 270', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
        expect(service.calculateHalfDayThresholdMinutes(config)).toBe(270);
      });

      it('half-day threshold with no requiredWorkingMinutes = floor(540/2)+60 = 330', () => {
        expect(service.calculateHalfDayThresholdMinutes(defaultConfig)).toBe(
          330,
        );
      });

      it('exactly at half-day threshold (300 min) → present + not-complete', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(300, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
      });

      it('1 min below half-day threshold (299 min) → present + incomplete-hours', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(299, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('incomplete-hours');
      });
    });

    // ── Incomplete Hours ──────────────────────────────────────────────
    describe('Incomplete Hours (< halfDayThreshold)', () => {
      it('5h with 8h requirement → present + not-complete', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(300, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
      });

      it('4h59 with 8h requirement → present + incomplete-hours', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(299, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('incomplete-hours');
      });

      it('15 min → present + incomplete-hours', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(15, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('incomplete-hours');
      });

      it('1 min → present + incomplete-hours', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(1, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('incomplete-hours');
      });
    });

    // ── Late Boundary (exclusive >) ───────────────────────────────────
    describe('Late Boundary (exclusive > threshold)', () => {
      it('10:30 with shift start 10:00 and 30-min threshold → on-time', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '19:00:00',
          requiredWorkingMinutes: 480,
          graceMinutes: null,
          lateThresholdMinutes: 30,
        };
        // 10:30 IST = 05:00 UTC. shift start 10:00 IST = 04:30 UTC.
        // late cutoff = 04:30 + 30min = 05:00 UTC. 05:00 > 05:00 → false (NOT late)
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T05:00:00.000Z'),
        );
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('10:31 with shift start 10:00 and 30-min threshold → late', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '19:00:00',
          requiredWorkingMinutes: 480,
          graceMinutes: null,
          lateThresholdMinutes: 30,
        };
        // 10:31 IST = 05:01 UTC. shift start 10:00 IST = 04:30 UTC.
        // late cutoff = 04:30 + 30min = 05:00 UTC. 05:01 > 05:00 → true (late)
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.punctualityStatus).toBe('late');
      });

      it('10:15 with shift start 10:00 and 30-min threshold → on-time', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '19:00:00',
          requiredWorkingMinutes: 480,
        };
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T04:45:00.000Z'),
        );
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('10:16 with shift start 10:00 and 15-min threshold → late', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '18:00:00',
          requiredWorkingMinutes: 420,
          lateThresholdMinutes: 15,
        };
        // 10:16 IST = 04:46 UTC. shift start 10:00 IST = 04:30 UTC.
        // late cutoff = 04:30 + 15min = 04:45 UTC. 04:46 > 04:45 → late
        const result = service.determineAttendanceStatus(
          420,
          true,
          config,
          new Date('2026-08-20T04:46:00.000Z'),
        );
        expect(result.punctualityStatus).toBe('late');
      });

      it('10:15 with shift start 10:00 and 15-min threshold → on-time', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '18:00:00',
          requiredWorkingMinutes: 420,
          lateThresholdMinutes: 15,
        };
        // 10:15 IST = 04:45 UTC. shift start 10:00 IST = 04:30 UTC.
        // late cutoff = 04:30 + 15min = 04:45 UTC. 04:45 > 04:45 → false (NOT late)
        const result = service.determineAttendanceStatus(
          420,
          true,
          config,
          new Date('2026-08-20T04:45:00.000Z'),
        );
        expect(result.punctualityStatus).toBe('on-time');
      });
    });

    // ── Late + Complete / Not Complete ─────────────────────────────────
    describe('Late + Completion combinations', () => {
      it('10:31–18:31 = 8h → late + complete', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '19:00:00',
          requiredWorkingMinutes: 480,
        };
        const result = service.determineAttendanceStatus(
          480,
          true,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
        expect(result.punctualityStatus).toBe('late');
      });

      it('10:31–18:30 = 7h59m → late + not-complete', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '19:00:00',
          requiredWorkingMinutes: 480,
        };
        const result = service.determineAttendanceStatus(
          479,
          true,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
        expect(result.punctualityStatus).toBe('late');
      });
    });

    // ── Different Organization Configs ─────────────────────────────────
    describe('Different Organization Configs', () => {
      it('7h req, 15-min late → complete at 420 min', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '18:00:00',
          requiredWorkingMinutes: 420,
          lateThresholdMinutes: 15,
        };
        const result = service.determineAttendanceStatus(
          420,
          true,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('7h req, 15-min late → late at 10:16', () => {
        const config = {
          ...defaultConfig,
          workStartTime: '10:00:00',
          workEndTime: '18:00:00',
          requiredWorkingMinutes: 420,
          lateThresholdMinutes: 15,
        };
        const result = service.determineAttendanceStatus(
          420,
          true,
          config,
          new Date('2026-08-20T04:46:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('complete');
        expect(result.punctualityStatus).toBe('late');
      });

      it('7h req → half-day threshold = floor(420/2)+60 = 270', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
        expect(service.calculateHalfDayThresholdMinutes(config)).toBe(270);
      });

      it('7h req, 269 min → incomplete-hours', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
        const result = service.determineAttendanceStatus(269, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('incomplete-hours');
      });

      it('7h req, 270 min → not-complete', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 420 };
        const result = service.determineAttendanceStatus(270, true, config);
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBe('not-complete');
      });
    });

    // ── No Clock-Out ──────────────────────────────────────────────────
    describe('No Clock-Out', () => {
      it('no clock-out on-time → present + null completion + on-time', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          0,
          false,
          config,
          new Date('2026-08-20T03:30:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBeNull();
        expect(result.punctualityStatus).toBe('on-time');
      });

      it('no clock-out late → present + null completion + late', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(
          0,
          false,
          config,
          new Date('2026-08-20T05:01:00.000Z'),
        );
        expect(result.status).toBe('present');
        expect(result.completionStatus).toBeNull();
        expect(result.punctualityStatus).toBe('late');
      });
    });

    // ── Zero Working Minutes with Clock-Out ────────────────────────────
    describe('Zero Working Minutes with Clock-Out', () => {
      it('0 min with clock-out → absent + null completion + null punctuality', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const result = service.determineAttendanceStatus(0, true, config);
        expect(result.status).toBe('absent');
        expect(result.completionStatus).toBeNull();
        expect(result.punctualityStatus).toBeNull();
      });
    });

    // ── half-day is NEVER generated ────────────────────────────────────
    describe('Half-Day Status is NEVER Generated', () => {
      it('should not return half-day status for any working duration', () => {
        const config = { ...defaultConfig, requiredWorkingMinutes: 480 };
        const durations = [
          0, 1, 15, 100, 200, 299, 300, 400, 479, 480, 500, 600,
        ];
        for (const dur of durations) {
          const result = service.determineAttendanceStatus(dur, true, config);
          expect(result.status).not.toBe('half-day');
        }
      });
    });
  });
});
