import { createAdminClient } from "@/lib/supabase/admin"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { resolveCoupon } from "@/lib/stripe/coupon"
import { RegisterForm } from "./register-form"

export default async function RegisterPage({
  params,
}: {
  params: { sessionId: string }
}) {
  const { sessionId } = params
  const admin = createAdminClient()

  // Fetch session with course details (incl. fee_cents on both for D-01 resolution
  // and attached_coupon_code for the auto-apply preview state).
  const { data: session, error } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, location_address, status, fee_cents, attached_coupon_code, ce_courses(title, credit_hours, fee_cents)"
    )
    .eq("id", sessionId)
    .single()

  // Session not found
  if (error || !session) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-xl font-semibold">Session Not Found</h1>
        <p className="text-muted-foreground text-sm">
          This registration link is invalid. Please check the QR code or link
          you were given.
        </p>
      </div>
    )
  }

  // Draft or cancelled
  if (session.status === "draft" || session.status === "cancelled") {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl text-muted-foreground">!</span>
        </div>
        <h1 className="text-xl font-semibold">Registration Unavailable</h1>
        <p className="text-muted-foreground text-sm">
          This session is not currently accepting registrations.
        </p>
      </div>
    )
  }

  // Past session
  const sessionDate = new Date(session.session_date + "T23:59:59")
  if (sessionDate < new Date()) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl text-muted-foreground">!</span>
        </div>
        <h1 className="text-xl font-semibold">Registration Closed</h1>
        <p className="text-muted-foreground text-sm">
          This class has already taken place. Registration is no longer
          available.
        </p>
      </div>
    )
  }

  const courses = session.ce_courses as unknown as
    | {
        title: string
        credit_hours: number
        fee_cents: number
      }
    | { title: string; credit_hours: number; fee_cents: number }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"
  const creditHours = course?.credit_hours || 3
  const courseFeeCents = course?.fee_cents ?? 0

  // D-01: session.fee_cents IF NOT NULL ELSE course.fee_cents
  const resolvedFeeCents =
    session.fee_cents !== null && session.fee_cents !== undefined
      ? session.fee_cents
      : courseFeeCents

  // Pre-resolve attached coupon at SSR so the form renders the correct chip
  // state on first paint (per UI-SPEC §"Page-Level Interaction Contracts").
  let attachedCouponPreview: {
    code: string
    discountCents: number
    finalCents: number
    isComp: boolean
    error?: string
  } | null = null

  if (session.attached_coupon_code && resolvedFeeCents > 0) {
    try {
      const r = await resolveCoupon(session.attached_coupon_code, resolvedFeeCents)
      attachedCouponPreview = {
        code: session.attached_coupon_code,
        discountCents: resolvedFeeCents - r.discountedFeeCents,
        finalCents: r.discountedFeeCents,
        isComp: r.discountedFeeCents === 0,
        error: r.error,
      }
    } catch {
      attachedCouponPreview = {
        code: session.attached_coupon_code,
        discountCents: 0,
        finalCents: resolvedFeeCents,
        isComp: false,
        error: "We couldn't verify that code right now. Please try again.",
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Session Header */}
      <div className="space-y-1 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <span className="text-lg font-bold text-primary">CE</span>
        </div>
        <h1 className="text-xl font-semibold">{courseTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {creditHours} CE Credit Hours
        </p>
      </div>

      <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium">
            {formatSessionDate(session.session_date)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Time</span>
          <span className="font-medium">
            {formatSessionTime(session.start_time)} &ndash;{" "}
            {formatSessionTime(session.end_time)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Location</span>
          <span className="font-medium text-right">
            {session.location_name}
            {session.location_address && (
              <>
                <br />
                <span className="font-normal text-muted-foreground">
                  {session.location_address}
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Registration Form */}
      <RegisterForm
        sessionId={session.id}
        resolvedFeeCents={resolvedFeeCents}
        attachedCouponCode={session.attached_coupon_code ?? null}
        attachedCouponPreview={attachedCouponPreview}
      />
    </div>
  )
}
