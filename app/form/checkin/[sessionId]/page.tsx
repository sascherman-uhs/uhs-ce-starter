import { createAdminClient } from "@/lib/supabase/admin"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { CheckInForm } from "./checkin-form"

export default async function CheckInPage(
  props: {
    params: Promise<{ sessionId: string }>
  }
) {
  const params = await props.params;
  const { sessionId } = params
  const admin = createAdminClient()

  // Fetch session with course details
  const { data: session, error } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, status, ce_courses(title)"
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
          This check-in link is invalid. Please check the QR code or link you
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
        <h1 className="text-xl font-semibold">Check-In Unavailable</h1>
        <p className="text-muted-foreground text-sm">
          This session is not currently accepting check-ins.
        </p>
      </div>
    )
  }

  // Check if it's class day (allow if in_progress status = manually opened)
  const pacificNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  )
  const pacificToday = `${pacificNow.getFullYear()}-${String(pacificNow.getMonth() + 1).padStart(2, "0")}-${String(pacificNow.getDate()).padStart(2, "0")}`
  const utcToday = new Date().toISOString().split("T")[0]
  const isClassDay =
    session.session_date === pacificToday ||
    session.session_date === utcToday ||
    session.status === "in_progress"

  if (!isClassDay) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl">&#128197;</span>
        </div>
        <h1 className="text-xl font-semibold">Check-In Not Open Yet</h1>
        <p className="text-muted-foreground text-sm">
          Check-in opens on{" "}
          <strong>{formatSessionDate(session.session_date)}</strong>.
        </p>
        <p className="text-xs text-muted-foreground">
          Come back on the day of class to check in.
        </p>
      </div>
    )
  }

  const courses = session.ce_courses as unknown as
    | { title: string }
    | { title: string }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"

  return (
    <div className="space-y-6">
      {/* Session Header — minimal for mobile */}
      <div className="space-y-1 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <span className="text-lg font-bold text-primary">CE</span>
        </div>
        <h1 className="text-xl font-semibold">Check In</h1>
        <p className="text-sm text-muted-foreground">{courseTitle}</p>
        <p className="text-xs text-muted-foreground">
          {session.location_name} &middot;{" "}
          {formatSessionTime(session.start_time)}
        </p>
      </div>

      {/* Check-In Form */}
      <CheckInForm sessionId={session.id} />
    </div>
  )
}
