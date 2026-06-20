import Image from "next/image"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"

export const dynamic = "force-dynamic"

export default async function RosterPage({
  params,
}: {
  params: { sessionId: string }
}) {
  const { sessionId } = params
  const admin = createAdminClient()

  // Fetch session with course details
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, location_address, status, ce_courses(title, credit_hours)"
    )
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl">!</span>
          </div>
          <h1 className="text-xl font-semibold">Session Not Found</h1>
          <p className="text-muted-foreground text-sm">
            This roster link is invalid. Please check the link you were given.
          </p>
        </div>
      </div>
    )
  }

  const courses = session.ce_courses as unknown as {
    title: string
    credit_hours: number
  } | { title: string; credit_hours: number }[] | null
  const course = Array.isArray(courses) ? courses[0] : courses
  const courseTitle = course?.title || "CE Class"
  const creditHours = course?.credit_hours || 3

  // Fetch registered attendees (only name and registration date — no PII)
  const { data: attendees } = await admin
    .from("ce_attendees")
    .select("first_name, last_name, created_at")
    .eq("session_id", sessionId)
    .in("status", ["registered", "checked_in"])
    .order("created_at", { ascending: true })

  const attendeeList = attendees || []
  const count = attendeeList.length

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4 text-center">
          <div className="mx-auto w-full rounded-lg bg-zinc-900 py-5 px-6">
            <Image
              src="/brand/logo.png"
              alt="Acme Staging Co."
              width={220}
              height={110}
              className="mx-auto"
              priority
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{courseTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {creditHours} CE Credit Hours
            </p>
          </div>
        </div>

        {/* Session Details */}
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

        {/* Attendee Count */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Registered Attendees</h2>
          <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-3 py-1">
            {count} registered
          </span>
        </div>

        {/* Attendee Table */}
        {count === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No registrations yet.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    Registered
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendeeList.map((attendee, index) => (
                  <tr
                    key={index}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {attendee.first_name} {attendee.last_name}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {new Date(attendee.created_at).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Acme Staging Co. &middot; CE Class Administration
        </p>
      </div>
    </div>
  )
}
