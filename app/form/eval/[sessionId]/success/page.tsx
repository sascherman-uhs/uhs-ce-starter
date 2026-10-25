import { createAdminClient } from "@/lib/supabase/admin"

export default async function EvalSuccessPage(
  props: {
    params: Promise<{ sessionId: string }>
    searchParams: Promise<{ name?: string; email?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { sessionId } = params
  const attendeeName = searchParams.name || "Attendee"
  const attendeeEmail = searchParams.email || "your email"
  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select("location_name, session_date, ce_courses(title)")
    .eq("id", sessionId)
    .single()

  const courses = session?.ce_courses as unknown as
    | { title: string }
    | { title: string }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"

  return (
    <div className="text-center space-y-6">
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

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Thank You for Attending!</h1>
        <p className="text-muted-foreground">
          Your evaluation has been submitted, <strong>{attendeeName}</strong>.
        </p>
        <p className="text-muted-foreground">
          We hope you got a lot out of the course &mdash; we enjoyed having you.
        </p>
      </div>

      <div className="rounded-lg bg-muted/50 p-4 text-sm text-center space-y-1">
        <p className="font-medium">{courseTitle}</p>
        {session?.location_name && (
          <p className="text-muted-foreground">{session.location_name}</p>
        )}
      </div>

      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-sm space-y-2">
        <p className="font-medium text-green-800 dark:text-green-300">
          Check your email for your certificate:
        </p>
        <p className="font-mono text-green-700 dark:text-green-400 break-all">
          {attendeeEmail}
        </p>
        <p className="text-xs text-green-600 dark:text-green-500">
          It should arrive within the next 3&ndash;5 minutes. Please check your
          spam folder if you don&apos;t see it. Still missing? Contact Scott at
          hello@example.com and we&apos;ll resend it.
        </p>
      </div>
    </div>
  )
}
