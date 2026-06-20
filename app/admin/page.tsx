import { createClient } from "@/lib/supabase/server"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import Link from "next/link"

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const supabase = await createClient()

  // Next.js 14: searchParams is synchronous — do NOT await.
  const showAll = searchParams.status === "all"

  let query = supabase
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, coordinator_name, status, registered_count, checked_in_count, evaluated_count, cascade_status, ce_courses(title)"
    )
  if (!showAll) {
    query = query.neq("status", "cancelled")
  }
  const { data: sessions } = await query.order("session_date", {
    ascending: false,
  })

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CE Sessions</h1>
          <p className="text-muted-foreground">
            Manage continuing education classes
          </p>
          <Link
            href={showAll ? "/admin" : "/admin?status=all"}
            className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {showAll ? "Hide cancelled" : "Show cancelled"}
          </Link>
        </div>
        <a
          href="/admin/sessions/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Session
        </a>
      </div>

      {sessions && sessions.length > 0 ? (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left text-sm font-medium">Date</th>
                <th className="p-3 text-left text-sm font-medium">Course</th>
                <th className="p-3 text-left text-sm font-medium">Location</th>
                <th className="p-3 text-left text-sm font-medium">Coordinator</th>
                <th className="p-3 text-left text-sm font-medium">Status</th>
                <th className="p-3 text-right text-sm font-medium">Registered</th>
                <th className="p-3 text-center text-sm font-medium">Cascade</th>
                <th className="p-3 text-right text-sm font-medium">Roster</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session: any) => {
                const cascade = session.cascade_status || {}
                const cascadeSteps = [
                  { key: "qr_codes", label: "QR" },
                  { key: "flyer", label: "Flyer" },
                  { key: "email", label: "Email" },
                  { key: "calendar", label: "Cal" },
                ]
                return (
                  <tr key={session.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-sm">
                      <Link
                        href={`/admin/sessions/${session.id}`}
                        className="text-primary hover:underline"
                      >
                        {formatSessionDate(session.session_date)}
                      </Link>
                    </td>
                    <td className="p-3 text-sm">
                      {(session.ce_courses as any)?.title || "—"}
                    </td>
                    <td className="p-3 text-sm">{session.location_name}</td>
                    <td className="p-3 text-sm">{session.coordinator_name}</td>
                    <td className="p-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          session.status === "scheduled"
                            ? "bg-blue-100 text-blue-700"
                            : session.status === "in_progress"
                            ? "bg-yellow-100 text-yellow-700"
                            : session.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : session.status === "filed"
                            ? "bg-gray-100 text-gray-700"
                            : session.status === "cancelled"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-right">
                      {session.registered_count}
                    </td>
                    <td className="p-3 text-sm text-center">
                      <div className="flex items-center justify-center gap-1">
                        {cascadeSteps.map((step) => (
                          <span
                            key={step.key}
                            title={step.label}
                            className={`h-2 w-2 rounded-full ${
                              cascade[step.key]?.completed_at
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <a
                        href={`/admin/sessions/${session.id}/roster-print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Print roster
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No sessions yet.{" "}
            <a href="/admin/sessions/new" className="text-primary hover:underline">
              Create your first session
            </a>{" "}
            to get started.
          </p>
        </div>
      )}
    </div>
  )
}
