import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeLicenseNumber } from "@/lib/registration/license"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { EvalForm } from "./eval-form"
import { GateCheck } from "./gate-check"

// Inline certificate pipeline (PDF + storage + Gmail SMTP) runs in the eval
// Server Action before redirect; raise the function budget so simultaneous
// class-wide eval submissions are not cut off. Valid on Vercel Hobby and Pro.
export const maxDuration = 60

export default async function EvalPage(
  props: {
    params: Promise<{ sessionId: string }>
    searchParams: Promise<{ license?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { sessionId } = params
  const admin = createAdminClient()

  // Fetch session with course details
  const { data: session, error } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, status, ce_courses(title, credit_hours)"
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
          This evaluation link is invalid. Please check the QR code or link you
          were given.
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
        <h1 className="text-xl font-semibold">Evaluation Unavailable</h1>
        <p className="text-muted-foreground text-sm">
          This session is not currently accepting evaluations.
        </p>
      </div>
    )
  }

  const courses = session.ce_courses as unknown as
    | { title: string; credit_hours: number }
    | { title: string; credit_hours: number }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"

  // If license provided via query param (e.g., from check-in success page),
  // verify the attendee is checked in
  const licenseParam = searchParams.license
    ? normalizeLicenseNumber(searchParams.license)
    : undefined
  let verifiedLicense: string | null = null

  if (licenseParam) {
    const { data: attendee } = await admin
      .from("ce_attendees")
      .select("id, first_name, last_name, status, license_number")
      .eq("session_id", sessionId)
      .eq("license_number", licenseParam)
      .single()

    if (attendee) {
      if (
        attendee.status === "evaluated" ||
        attendee.status === "certified"
      ) {
        // Already evaluated
        return (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">
              Already Submitted
            </h1>
            <p className="text-muted-foreground text-sm">
              {attendee.first_name} {attendee.last_name}, you&apos;ve already
              completed your evaluation. Your certificate has been emailed to
              you.
            </p>
          </div>
        )
      }

      if (attendee.status === "checked_in") {
        verifiedLicense = attendee.license_number
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
        <h1 className="text-xl font-semibold">Course Evaluation</h1>
        <p className="text-sm text-muted-foreground">{courseTitle}</p>
        <p className="text-xs text-muted-foreground">
          {session.location_name} &middot;{" "}
          {formatSessionDate(session.session_date)}
        </p>
      </div>

      {/* If license is verified from query param, show eval form directly */}
      {verifiedLicense ? (
        <EvalForm sessionId={session.id} licenseNumber={verifiedLicense} />
      ) : (
        /* Otherwise, show gate check — ask for license to verify check-in */
        <GateCheck sessionId={session.id} />
      )}
    </div>
  )
}
