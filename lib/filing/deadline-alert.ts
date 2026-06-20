import { createAdminClient } from "@/lib/supabase/admin"
import { differenceInBusinessDays, isWeekend, addDays, format } from "date-fns"

// ============================================================
// Filing Deadline Alert — the background worker Heartbeat Integration
// ============================================================
// This module checks for approaching filing deadlines and
// generates alerts for the the background worker autonomous operations system.
//
// Per NAC 645.455: roster must be submitted within 3 business
// days after course completion. $500 fine per violation.
//
// Alert levels:
//   - "urgent"   : deadline is today or overdue
//   - "warning"  : deadline is tomorrow (1 business day away)
//   - "upcoming" : deadline is within 2-3 business days
//
// Integration point: the background worker (cron/heartbeat) calls checkFilingDeadlines()
// during each cycle. Alerts are surfaced via Slack/Telegram.
// ============================================================

// Nevada state holidays (same set used in dates.ts)
const NV_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-07-03",
  "2026-07-04",
  "2026-09-07",
  "2026-10-30",
  "2026-11-11",
  "2026-11-26",
  "2026-11-27",
  "2026-12-25",
])

function isNevadaHoliday(date: Date): boolean {
  return NV_HOLIDAYS_2026.has(format(date, "yyyy-MM-dd"))
}

function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isNevadaHoliday(date)
}

/** Count remaining business days from today to the deadline (inclusive). */
function businessDaysUntil(deadline: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(deadline)
  target.setHours(0, 0, 0, 0)

  if (target < today) {
    // Already past deadline — return negative count
    let count = 0
    let d = new Date(target)
    while (d < today) {
      d = addDays(d, 1)
      if (isBusinessDay(d)) count++
    }
    return -count
  }

  let count = 0
  let d = new Date(today)
  while (d < target) {
    d = addDays(d, 1)
    if (isBusinessDay(d)) count++
  }
  return count
}

export type FilingAlert = {
  sessionId: string
  sessionDate: string
  locationName: string
  courseTitle: string
  filingDeadline: string
  businessDaysRemaining: number
  level: "urgent" | "warning" | "upcoming"
  message: string
  rosterFiled: boolean
  evalFiled: boolean
}

/**
 * Check all sessions for approaching filing deadlines.
 * Returns alerts sorted by urgency (most urgent first).
 *
 * Usage in the background worker (cron/heartbeat):
 * ```ts
 * import { checkFilingDeadlines } from "@/lib/filing/deadline-alert"
 *
 * // In heartbeat cycle:
 * const alerts = await checkFilingDeadlines()
 * for (const alert of alerts) {
 *   if (alert.level === "urgent") {
 *     // Send Slack/Telegram notification immediately
 *     // Draft filing emails via Outlook MCP
 *   } else if (alert.level === "warning") {
 *     // Send reminder notification
 *   }
 * }
 * ```
 */
export async function checkFilingDeadlines(): Promise<FilingAlert[]> {
  const admin = createAdminClient()

  // Fetch sessions that have a filing deadline but are not fully filed
  const { data: sessions, error } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, location_name, filing_deadline, filed_785a_at, filed_612c_at, status, ce_courses(title)"
    )
    .not("filing_deadline", "is", null)
    .in("status", ["completed", "scheduled", "in_progress"])
    .order("filing_deadline", { ascending: true })

  if (error || !sessions) {
    console.error("Failed to check filing deadlines:", error)
    return []
  }

  const alerts: FilingAlert[] = []

  for (const session of sessions) {
    const rosterFiled = !!session.filed_785a_at
    const evalFiled = !!session.filed_612c_at

    // Skip fully filed sessions
    if (rosterFiled && evalFiled) continue

    const deadline = new Date(session.filing_deadline + "T23:59:59")
    const daysRemaining = businessDaysUntil(deadline)

    // Only alert if within 3 business days or overdue
    if (daysRemaining > 3) continue

    const course = session.ce_courses as any
    const courseTitle = course?.title || "CE Class"

    let level: FilingAlert["level"]
    let message: string

    if (daysRemaining <= 0) {
      level = "urgent"
      const overdueDays = Math.abs(daysRemaining)
      message = `OVERDUE: Filing for ${courseTitle} at ${session.location_name} (${session.session_date}) is ${overdueDays} business day${overdueDays !== 1 ? "s" : ""} past deadline.`
      if (!rosterFiled)
        message += " 785a roster NOT filed."
      if (!evalFiled)
        message += " 612C eval summary NOT filed."
    } else if (daysRemaining === 1) {
      level = "warning"
      message = `DUE TOMORROW: Filing for ${courseTitle} at ${session.location_name} (${session.session_date}). Deadline: ${session.filing_deadline}.`
      if (!rosterFiled)
        message += " 785a roster needs filing."
      if (!evalFiled)
        message += " 612C eval summary needs filing."
    } else {
      level = "upcoming"
      message = `UPCOMING: Filing for ${courseTitle} at ${session.location_name} due in ${daysRemaining} business days (${session.filing_deadline}).`
    }

    alerts.push({
      sessionId: session.id,
      sessionDate: session.session_date,
      locationName: session.location_name,
      courseTitle,
      filingDeadline: session.filing_deadline,
      businessDaysRemaining: daysRemaining,
      level,
      message,
      rosterFiled,
      evalFiled,
    })
  }

  // Sort: urgent first, then warning, then upcoming
  const levelOrder = { urgent: 0, warning: 1, upcoming: 2 }
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level])

  return alerts
}
