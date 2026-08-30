import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { OrganizationSettings } from 'src/modules/auth-core/entities/organization-settings.entity';
import { AttendanceSettings } from 'src/modules/attendance/entities/attendance-settings.entity';

/**
 * Default business timezone applied to existing organizations for backward
 * compatibility. This is ONLY a migration/default value and legacy fallback.
 * It must NOT be used as a global runtime assumption for business logic.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * THE canonical organization timezone service.
 *
 * SOURCE OF TRUTH: organization_settings.timezone (single IANA identifier).
 * Legacy fallback: attendance_settings.timezone (read-only; kept only so
 * existing organizations that never had a settings row configured still work).
 *
 * All business-timezone calculations must resolve the timezone through this
 * service — never via hardcoded `Asia/Kolkata` literals in business logic.
 */
@Injectable()
export class OrganizationTimezoneService {
  constructor(
    @InjectRepository(OrganizationSettings)
    private readonly orgSettingsRepo: Repository<OrganizationSettings>,
    @InjectRepository(AttendanceSettings)
    private readonly attendanceSettingsRepo: Repository<AttendanceSettings>,
  ) {}

  /**
   * Resolve the canonical IANA timezone for an organization.
   * Fallback chain: organization_settings.timezone → attendance_settings.timezone → Asia/Kolkata.
   */
  async getOrganizationTimezone(organizationId: string): Promise<string> {
    if (!organizationId) return DEFAULT_TIMEZONE;

    const orgSettings = (await this.orgSettingsRepo
      .findOne({ where: { organizationId } })
      .catch(() => null)) as OrganizationSettings | null;
    const orgTz = orgSettings?.timezone;
    if (typeof orgTz === 'string' && orgTz) return orgTz;

    // Legacy read-only fallback (not an editable second source of truth).
    const attSettings = (await this.attendanceSettingsRepo
      .findOne({ where: { organizationId } })
      .catch(() => null)) as AttendanceSettings | null;
    const attTz = attSettings?.timezone;
    return typeof attTz === 'string' && attTz ? attTz : DEFAULT_TIMEZONE;
  }

  /** The current instant as a Luxon DateTime in the org timezone. */
  async getNow(organizationId: string): Promise<DateTime> {
    const tz = await this.getOrganizationTimezone(organizationId);
    return DateTime.now().setZone(tz);
  }

  /** Business "today" (YYYY-MM-DD) in the org timezone. */
  async getToday(organizationId: string): Promise<string> {
    return (await this.getNow(organizationId)).toFormat('yyyy-MM-dd');
  }

  /** Business "yesterday" (YYYY-MM-DD) in the org timezone. */
  async getYesterday(organizationId: string): Promise<string> {
    return (await this.getNow(organizationId))
      .minus({ days: 1 })
      .toFormat('yyyy-MM-dd');
  }

  /**
   * Convert a business local date + time (interpreted in the org timezone)
   * to a UTC ISO string with `Z`.
   *
   * date: "2026-08-28", time: "22:00", tz: "Asia/Kolkata"
   *   → "2026-08-28T16:30:00.000Z"
   */
  async toUtcISO(
    organizationId: string,
    date: string,
    time: string,
  ): Promise<string> {
    const tz = await this.getOrganizationTimezone(organizationId);
    return OrganizationTimezoneService.toUtcISOForZone(date, time, tz);
  }

  /** Static: convert business local date + time in a given IANA zone to a UTC ISO string. */
  static toUtcISOForZone(date: string, time: string, tz: string): string {
    const dt = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', {
      zone: tz,
    });
    if (!dt.isValid) {
      throw new Error(
        `toUtcISOForZone: invalid date/time "${date} ${time}" for zone "${tz}"`,
      );
    }
    return dt.toUTC().toISO();
  }

  /**
   * Format a UTC java Date / ISO string into an org-timezone value.
   * `format` uses Luxon tokens (e.g. "yyyy-MM-dd", "hh:mm a", "dd-LL-yyyy HH:mm").
   */
  async formatInOrganizationTimezone(
    organizationId: string,
    value: Date | string,
    format: string,
  ): Promise<string> {
    const tz = await this.getOrganizationTimezone(organizationId);
    return OrganizationTimezoneService.formatForZone(value, tz, format);
  }

  /** Static: format a UTC instant into a given IANA zone. */
  static formatForZone(
    value: Date | string,
    tz: string,
    format: string,
  ): string {
    const dt =
      value instanceof Date
        ? DateTime.fromJSDate(value).setZone(tz)
        : DateTime.fromISO(value, { zone: 'utc' }).setZone(tz);
    return dt.toFormat(format);
  }
}
