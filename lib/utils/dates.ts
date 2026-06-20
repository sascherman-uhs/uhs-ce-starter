import { addDays, isWeekend, format, parse } from "date-fns"

// Nevada state holidays (month-day or specific dates for floating holidays)
// Updated annually -- these are 2026 dates
const NV_HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents Day
  "2026-05-25", // Memorial Day
  "2026-07-03", // Independence Day (observed)
  "2026-07-04", // Independence Day
  "2026-09-07", // Labor Day
  "2026-10-30", // Nevada Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving
  "2026-11-27", // Family Day (day after Thanksgiving)
  "2026-12-25", // Christmas
])

function isNevadaHoliday(date: Date): boolean {
  const dateStr = format(date, "yyyy-MM-dd")
  return NV_HOLIDAYS_2026.has(dateStr)
}

function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isNevadaHoliday(date)
}

/**
 * Calculate filing deadline: 3 business days after session date
 * Excludes weekends and Nevada state holidays
 */
export function calculateFilingDeadline(sessionDate: Date): Date {
  let deadline = sessionDate
  let businessDaysAdded = 0

  while (businessDaysAdded < 3) {
    deadline = addDays(deadline, 1)
    if (isBusinessDay(deadline)) {
      businessDaysAdded++
    }
  }

  return deadline
}

/**
 * Format a date string for display: "Apr 15, 2026"
 */
export function formatSessionDate(dateStr: string): string {
  const date = parse(dateStr, "yyyy-MM-dd", new Date())
  return format(date, "MMM d, yyyy")
}

/**
 * Format a time string for display: "10:00 AM"
 */
export function formatSessionTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`
}
