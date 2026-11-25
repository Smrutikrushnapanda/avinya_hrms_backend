export function requestBusinessDays(
  startDateStr: string,
  endDateStr: string,
): number {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  let count = 0;
  for (
    const day = new Date(startDate);
    day <= endDate;
    day.setDate(day.getDate() + 1)
  ) {
    if (day.getDay() !== 0 && day.getDay() !== 6) count++;
  }
  return count;
}

export function applicationDuration(
  kind: 'leave' | 'wfh',
  start: string,
  end: string,
  duration?: number,
) {
  if (kind === 'leave' && start === end && duration === 0.5) return 0.5;
  const days = requestBusinessDays(start, end);
  return kind === 'wfh' ? days || 1 : days;
}
