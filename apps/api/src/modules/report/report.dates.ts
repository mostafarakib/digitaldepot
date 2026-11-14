/**
 * Asia/Dhaka (UTC+6) Date Handling for Business Reporting & Analytics.
 *
 * Bangladesh Standard Time is fixed UTC+6 with no daylight saving time.
 * All date queries use half-open intervals [startDate, endDate) where:
 *   timestamp >= startDate AND timestamp < endDate.
 */

export const DHAKA_TIMEZONE = 'Asia/Dhaka';
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // +06:00 in milliseconds

export type ReportDatePreset =
  'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';

export interface DateRangeResult {
  preset: ReportDatePreset;
  startDate: Date; // Inclusive (gte)
  endDate: Date; // Exclusive (lt)
  dateFromStr: string; // YYYY-MM-DD in BST
  dateToStr: string; // YYYY-MM-DD in BST
}

/**
 * Gets parts (year, month 0-indexed, day) of a date in Asia/Dhaka time.
 */
export function getDhakaDateParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  // Add 6 hours to UTC to get local BST time
  const bstTime = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return {
    year: bstTime.getUTCFullYear(),
    month: bstTime.getUTCMonth(),
    day: bstTime.getUTCDate(),
  };
}

/**
 * Creates a UTC Date corresponding to 00:00:00.000 Asia/Dhaka for a given Y, M, D.
 */
export function dhakaStartOfDay(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month, day, 0, 0, 0, 0);
  return new Date(utcMidnight - DHAKA_OFFSET_MS);
}

/**
 * Pads number to 2 digits.
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDhakaDateStr(date: Date): string {
  const parts = getDhakaDateParts(date);
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;
}

/**
 * Parses YYYY-MM-DD into { year, month, day }.
 */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  return {
    year: parseInt(match[1]!, 10),
    month: parseInt(match[2]!, 10) - 1,
    day: parseInt(match[3]!, 10),
  };
}

/**
 * Computes exact half-open [startDate, endDate) UTC date bounds for a report query.
 */
export function resolveDhakaDateRange(
  preset: ReportDatePreset = 'last30days',
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): DateRangeResult {
  const todayParts = getDhakaDateParts(now);

  if (preset === 'custom') {
    if (!customFrom || !customTo) {
      throw new Error('Both dateFrom and dateTo are required when preset is "custom".');
    }
    const fromParts = parseDateString(customFrom);
    const toParts = parseDateString(customTo);

    const startDate = dhakaStartOfDay(fromParts.year, fromParts.month, fromParts.day);
    // End date is day after customTo at 00:00:00 BST to make customTo inclusive
    const toNextDay = new Date(Date.UTC(toParts.year, toParts.month, toParts.day + 1));
    const endDate = dhakaStartOfDay(
      toNextDay.getUTCFullYear(),
      toNextDay.getUTCMonth(),
      toNextDay.getUTCDate(),
    );

    if (startDate.getTime() >= endDate.getTime()) {
      throw new Error('dateFrom must be before or equal to dateTo.');
    }

    return {
      preset: 'custom',
      startDate,
      endDate,
      dateFromStr: customFrom,
      dateToStr: customTo,
    };
  }

  let startYear = todayParts.year;
  let startMonth = todayParts.month;
  let startDay = todayParts.day;

  let endYear = todayParts.year;
  let endMonth = todayParts.month;
  let endDay = todayParts.day + 1; // Tomorrow 00:00 BST by default

  switch (preset) {
    case 'today':
      // [Today 00:00, Tomorrow 00:00)
      startDay = todayParts.day;
      break;

    case 'yesterday': {
      // [Yesterday 00:00, Today 00:00)
      startDay = todayParts.day - 1;
      endDay = todayParts.day;
      break;
    }

    case 'last7days': {
      // Includes today + 6 previous days = 7 days total
      startDay = todayParts.day - 6;
      break;
    }

    case 'last30days': {
      // Includes today + 29 previous days = 30 days total
      startDay = todayParts.day - 29;
      break;
    }

    case 'thisMonth': {
      // 1st of current month to tomorrow 00:00
      startDay = 1;
      break;
    }

    case 'lastMonth': {
      // 1st of previous month to 1st of current month
      const firstOfThisMonth = new Date(Date.UTC(todayParts.year, todayParts.month, 1));
      const firstOfLastMonth = new Date(Date.UTC(todayParts.year, todayParts.month - 1, 1));
      startYear = firstOfLastMonth.getUTCFullYear();
      startMonth = firstOfLastMonth.getUTCMonth();
      startDay = 1;

      endYear = firstOfThisMonth.getUTCFullYear();
      endMonth = firstOfThisMonth.getUTCMonth();
      endDay = 1;
      break;
    }
  }

  const startDateObj = new Date(Date.UTC(startYear, startMonth, startDay));
  const endDateObj = new Date(Date.UTC(endYear, endMonth, endDay));

  const startDate = dhakaStartOfDay(
    startDateObj.getUTCFullYear(),
    startDateObj.getUTCMonth(),
    startDateObj.getUTCDate(),
  );
  const endDate = dhakaStartOfDay(
    endDateObj.getUTCFullYear(),
    endDateObj.getUTCMonth(),
    endDateObj.getUTCDate(),
  );

  // Compute inclusive display dateToStr (day before endDate in BST)
  const inclusiveEnd = new Date(endDate.getTime() - 1);

  return {
    preset,
    startDate,
    endDate,
    dateFromStr: formatDhakaDateStr(startDate),
    dateToStr: formatDhakaDateStr(inclusiveEnd),
  };
}
