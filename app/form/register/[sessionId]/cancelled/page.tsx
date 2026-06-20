import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"

/**
 * Stripe Checkout cancel-return page (Phase 8 / Plan 05 / D-07).
 *
 * Stripe sends users here when they click "← Back" in Checkout or the
 * Checkout session times out. The Server Action's success_url + cancel_url
 * pair is wired in Plan 08-04's `registerForSession` paid-path branch.
 *
 * READ-ONLY: this page never writes to ce_attendees. The "Try again" CTA
 * sends the user back to the registration form to re-submit.
 *
 * Copy is verbatim from UI-SPEC §"Stripe Checkout cancel page".
 */
export default async function CancelledPage({
  params,
}: {
  params: { sessionId: string }
}) {
  const { sessionId } = params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select(
      "session_date, start_time, end_time, location_name, ce_courses(title)"
    )
    .eq("id", sessionId)
    .single()

  const courses = session?.ce_courses as unknown as
    | { title: string }
    | { title: string }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"
  const dateLabel = session?.session_date
    ? formatSessionDate(session.session_date)
    : ""
  const timeLabel =
    session?.start_time && session?.end_time
      ? `${formatSessionTime(session.start_time)} – ${formatSessionTime(session.end_time)}`
      : ""

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Payment cancelled</h1>
        <p className="text-sm text-muted-foreground">{courseTitle}</p>
        {dateLabel && (
          <p className="text-sm text-muted-foreground">
            {dateLabel}
            {timeLabel ? ` • ${timeLabel}` : ""}
          </p>
        )}
      </div>

      {/* Amber warning banner per UI-SPEC §"Color / Refund-warning" sub-role */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Your card was not charged. You can try again whenever you&apos;re ready.
      </div>

      <p className="text-sm text-muted-foreground text-center">
        We saved what you entered &mdash; just confirm and resubmit.
      </p>

      <Link
        href={`/form/register/${sessionId}`}
        className="block w-full rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground text-center hover:bg-primary/90"
      >
        Try again
      </Link>
    </div>
  )
}
