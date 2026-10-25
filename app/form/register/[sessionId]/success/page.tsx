import { createAdminClient } from "@/lib/supabase/admin"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { ConfirmingPoll } from "./confirming-poll"

// Force dynamic rendering + uncached data fetching so the paid-path attendee
// lookup (by stripe_checkout_session_id) always reads fresh. Without this,
// Next.js caches the initial pre-webhook empty read and the page is stuck on
// "Confirming your registration…" forever even after the webhook writes the
// row. Mirrors app/api/payments/status/route.ts.
export const dynamic = "force-dynamic"

/**
 * Stripe Checkout success-return / free-path success page (Phase 8 / Plan 05).
 *
 * Two-state Server Component:
 *   1. Confirming view — `?cs=cs_xxx` present AND ce_attendees row not yet
 *      written by the webhook (Plan 08-02 fulfillCheckout). Shows a spinner
 *      shell, no-JS <meta refresh> fallback, and the JS poll island.
 *   2. Success view — free path (no `?cs=`) OR paid path with the row
 *      present. Renders the existing "You're registered!" layout.
 *
 * The branch key is `!!checkoutSessionId && !attendee` so the free-path
 * (no `?cs=` query param) ALWAYS lands directly on the success view —
 * preserves byte-equivalent UX for the existing free flow.
 *
 * READ-ONLY: this page never writes to ce_attendees. The webhook is the
 * sole writer per CONTEXT D-05.
 *
 * Copy is verbatim from UI-SPEC §"Stripe Checkout success page".
 */
export default async function RegistrationSuccessPage(
  props: {
    params: Promise<{ sessionId: string }>
    searchParams: Promise<{ cs?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { sessionId } = params
  const checkoutSessionId = searchParams?.cs
  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select(
      "session_date, start_time, end_time, location_name, location_address, ce_courses(title)"
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

  // If `?cs=` is present (paid-path return from Stripe), check whether the
  // webhook has fired by looking for the ce_attendees row keyed by
  // stripe_checkout_session_id.
  let attendee: { first_name: string; email?: string | null } | null = null
  if (checkoutSessionId && checkoutSessionId.startsWith("cs_")) {
    const { data } = await admin
      .from("ce_attendees")
      .select("first_name, email")
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle()
    if (data) attendee = data
  }

  // Two states:
  //   1. Confirming (paid path, webhook not yet landed) — only when ?cs= AND no attendee row
  //   2. Success (free path OR paid path with row present) — default
  const isConfirming = !!checkoutSessionId && !attendee

  if (isConfirming) {
    return (
      <>
        {/* No-JS fallback per UI-SPEC §"Mobile-First & Progressive Enhancement Rules" rule 1 */}
        <meta httpEquiv="refresh" content="2" />
        <div className="text-center space-y-4 py-12" aria-busy="true">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <span className="text-lg" aria-hidden="true">
              ⌛
            </span>
          </div>
          <h1 className="text-2xl font-semibold">
            Confirming your registration&hellip;
          </h1>
          <p className="text-sm text-muted-foreground">
            Stripe is finalizing your payment. This page will refresh in a
            moment.
          </p>
          <ConfirmingPoll checkoutSessionId={checkoutSessionId} />
        </div>
      </>
    )
  }

  // Success view (free-path keeps the existing layout; paid-path lands here
  // once the webhook has written the row).
  const greetingName = attendee?.first_name ? `, ${attendee.first_name}` : ""
  const emailLine = attendee?.email
    ? `We've emailed your class details to ${attendee.email}.`
    : `We've emailed your class details.`

  return (
    <div className="text-center space-y-6 py-8">
      <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-600 dark:text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          You&apos;re registered{greetingName}!
        </h1>
        <p className="text-sm text-muted-foreground">{courseTitle}</p>
      </div>

      <div className="rounded-md bg-muted p-4 text-sm space-y-1">
        <p>{emailLine}</p>
        {dateLabel && <p>See you on {dateLabel}.</p>}
        {session?.start_time && session?.end_time && (
          <p className="text-muted-foreground">
            {formatSessionTime(session.start_time)} &ndash;{" "}
            {formatSessionTime(session.end_time)}
            {session.location_name ? ` • ${session.location_name}` : ""}
          </p>
        )}
      </div>
    </div>
  )
}
