import { OrganizationTimezoneService } from './organization-timezone.service';

describe('OrganizationTimezoneService (timezone regression)', () => {
  const static_ = OrganizationTimezoneService.toUtcISOForZone;
  const fmt = OrganizationTimezoneService.formatForZone;

  describe('business local time → UTC conversion', () => {
    it('Asia/Kolkata 10:00 → 04:30 UTC', () => {
      expect(static_('2026-08-28', '10:00', 'Asia/Kolkata')).toBe(
        '2026-08-28T04:30:00.000Z',
      );
    });

    it('Asia/Kolkata 22:00 → 16:30 UTC same day', () => {
      expect(static_('2026-08-28', '22:00', 'Asia/Kolkata')).toBe(
        '2026-08-28T16:30:00.000Z',
      );
    });

    it('Asia/Kolkata 00:30 → previous UTC day', () => {
      expect(static_('2026-08-29', '00:30', 'Asia/Kolkata')).toBe(
        '2026-08-28T19:00:00.000Z',
      );
    });

    it('America/New_York 10:00 → 14:00 UTC (EDT, DST summer)', () => {
      expect(static_('2026-08-28', '10:00', 'America/New_York')).toBe(
        '2026-08-28T14:00:00.000Z',
      );
    });

    it('America/New_York 10:00 → 15:00 UTC (EST, DST winter)', () => {
      expect(static_('2026-01-15', '10:00', 'America/New_York')).toBe(
        '2026-01-15T15:00:00.000Z',
      );
    });

    it('Europe/London 10:00 → 09:00 UTC (BST, DST summer)', () => {
      expect(static_('2026-08-28', '10:00', 'Europe/London')).toBe(
        '2026-08-28T09:00:00.000Z',
      );
    });

    it('Europe/London 10:00 → 10:00 UTC (GMT, DST winter)', () => {
      expect(static_('2026-01-15', '10:00', 'Europe/London')).toBe(
        '2026-01-15T10:00:00.000Z',
      );
    });

    it('Asia/Tokyo 10:00 → 01:00 UTC (no DST)', () => {
      expect(static_('2026-08-28', '10:00', 'Asia/Tokyo')).toBe(
        '2026-08-28T01:00:00.000Z',
      );
    });
  });

  describe('same instant, different organizations', () => {
    const instant = '2026-08-28T16:30:00.000Z';

    it('displays 22:00 IST for Asia/Kolkata', () => {
      expect(fmt(instant, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm')).toBe(
        '2026-08-28 22:00',
      );
    });

    it('displays 12:30 EDT for America/New_York', () => {
      expect(fmt(instant, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe(
        '2026-08-28 12:30',
      );
    });
  });

  describe('"today" differs around UTC midnight', () => {
    // UTC: 2026-08-28 19:30 → Kolkata: Aug 29 01:00; New York: Aug 28 15:30
    const justAfterUtcMidnightBoundary = new Date('2026-08-28T19:30:00.000Z');

    it('Asia/Kolkata org is already on Aug 29', () => {
      expect(
        fmt(justAfterUtcMidnightBoundary, 'Asia/Kolkata', 'yyyy-MM-dd'),
      ).toBe('2026-08-29');
    });

    it('America/New_York org is still on Aug 28', () => {
      expect(
        fmt(justAfterUtcMidnightBoundary, 'America/New_York', 'yyyy-MM-dd'),
      ).toBe('2026-08-28');
    });
  });

  describe('timezone resolution fallback chain', () => {
    const buildService = (orgTz: any, attTz: any) =>
      new OrganizationTimezoneService(
        { findOne: jest.fn().mockResolvedValue(orgTz) } as any,
        { findOne: jest.fn().mockResolvedValue(attTz) } as any,
      );

    it('uses organization_settings.timezone when present', async () => {
      const svc = buildService({ timezone: 'Europe/London' }, null);
      await expect(svc.getOrganizationTimezone('org-1')).resolves.toBe(
        'Europe/London',
      );
    });

    it('falls back to legacy attendance_settings.timezone', async () => {
      const svc = buildService(null, { timezone: 'Asia/Tokyo' });
      await expect(svc.getOrganizationTimezone('org-1')).resolves.toBe(
        'Asia/Tokyo',
      );
    });

    it('defaults to Asia/Kolkata (backward compatibility for existing orgs)', async () => {
      const svc = buildService(null, null);
      await expect(svc.getOrganizationTimezone('org-1')).resolves.toBe(
        'Asia/Kolkata',
      );
    });

    it('defaults to Asia/Kolkata for missing organizationId', async () => {
      const svc = buildService(null, null);
      await expect(svc.getOrganizationTimezone('')).resolves.toBe(
        'Asia/Kolkata',
      );
    });

    it('"today" and "yesterday" use the org timezone', async () => {
      const svc = buildService({ timezone: 'UTC' }, null);
      const today = await svc.getToday('org-1');
      const yesterday = await svc.getYesterday('org-1');
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('toUtcISO converts business local time per org timezone', async () => {
      const svcKolkata = buildService({ timezone: 'Asia/Kolkata' }, null);
      const svcNewYork = buildService({ timezone: 'America/New_York' }, null);
      await expect(svcKolkata.toUtcISO('org-a', '2026-08-28', '10:00')).resolves.toBe(
        '2026-08-28T04:30:00.000Z',
      );
      await expect(svcNewYork.toUtcISO('org-b', '2026-08-28', '10:00')).resolves.toBe(
        '2026-08-28T14:00:00.000Z',
      );
    });
  });

  it('rejects invalid date/time input', () => {
    expect(() => static_('28-08-2026', '10:00', 'Asia/Kolkata')).toThrow();
  });
});
