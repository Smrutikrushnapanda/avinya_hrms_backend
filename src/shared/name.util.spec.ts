import { getFullName } from './name.util';

describe('getFullName', () => {
  it('joins first, middle and last name', () => {
    expect(getFullName('Priya', 'Ann', 'Sharma')).toBe('Priya Ann Sharma');
  });

  it('omits missing parts', () => {
    expect(getFullName('Priya', null, 'Sharma')).toBe('Priya Sharma');
    expect(getFullName('Priya', undefined, undefined)).toBe('Priya');
    expect(getFullName('', '', 'Sharma')).toBe('Sharma');
  });

  it('filters whitespace-only parts and trims the result', () => {
    expect(getFullName('Priya', '', 'Sharma')).toBe('Priya Sharma');
    expect(getFullName('Priya', '  ', 'Sharma')).toBe('Priya Sharma');
    expect(getFullName('  Priya Ann Sharma  ')).toBe('Priya Ann Sharma');
  });

  it('returns empty string when all parts missing', () => {
    expect(getFullName(null, null, null)).toBe('');
    expect(getFullName(undefined, undefined, undefined)).toBe('');
    expect(getFullName('   ', '   ', '')).toBe('');
  });

  it('handles a single name part', () => {
    expect(getFullName('Cheryl', '', '')).toBe('Cheryl');
  });
});