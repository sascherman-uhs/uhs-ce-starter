import { createAdminClient } from "@/lib/supabase/admin"

export type NoShowAttendee = {
  id: string
  first_name: string
  last_name: string
  license_number: string
  email: string
  phone: string | null
  registered_at: string | null
  opted_out: boolean
  session_id: string
  session_date?: string
  location_name?: string
  course_title?: string
}

/**
 * Get no-shows for a specific session.
 * No-shows = registered but never checked in (status still 'registered')
 * for a session that is completed or filed.
 */
export async function getSessionNoShows(
  sessionId: string
): Promise<NoShowAttendee[]> {
  const admin = createAdminClient()

  // Verify session is completed/filed
  const { data: session } = await admin
    .from("ce_sessions")
    .select("id, status, session_date, location_name")
    .eq("id", sessionId)
    .single()

  if (
    !session ||
    (session.status !== "completed" && session.status !== "filed")
  ) {
    return []
  }

  const { data: noShows, error } = await admin
    .from("ce_attendees")
    .select(
      "id, first_name, last_name, license_number, email, phone, registered_at, opted_out, session_id"
    )
    .eq("session_id", sessionId)
    .eq("status", "registered")
    .order("last_name", { ascending: true })

  if (error) {
    console.error("Failed to fetch session no-shows:", error)
    return []
  }

  return (noShows || []).map((a) => ({
    ...a,
    session_date: session.session_date,
    location_name: session.location_name,
  }))
}

/**
 * Get all no-shows across all completed/filed sessions.
 * Excludes opted-out attendees by default.
 * Deduplicates by email — returns the most recent no-show per person.
 */
export async function getGlobalNoShows(options?: {
  includeOptedOut?: boolean
}): Promise<(NoShowAttendee & { session_date: string; location_name: string; course_title: string })[]> {
  const admin = createAdminClient()

  // Get all completed/filed sessions
  const { data: sessions } = await admin
    .from("ce_sessions")
    .select("id, session_date, location_name, status, ce_courses(title)")
    .in("status", ["completed", "filed"])
    .order("session_date", { ascending: false })

  if (!sessions || sessions.length === 0) return []

  const sessionIds = sessions.map((s) => s.id)
  const sessionMap = new Map(
    sessions.map((s) => [
      s.id,
      {
        session_date: s.session_date,
        location_name: s.location_name,
        course_title: (s.ce_courses as any)?.title || "Unknown Course",
      },
    ])
  )

  // Get all no-shows (status = 'registered' means they never checked in)
  let query = admin
    .from("ce_attendees")
    .select(
      "id, first_name, last_name, license_number, email, phone, registered_at, opted_out, session_id"
    )
    .in("session_id", sessionIds)
    .eq("status", "registered")
    .order("registered_at", { ascending: false })

  if (!options?.includeOptedOut) {
    query = query.eq("opted_out", false)
  }

  const { data: noShows, error } = await query

  if (error) {
    console.error("Failed to fetch global no-shows:", error)
    return []
  }

  return (noShows || []).map((a) => {
    const sessionInfo = sessionMap.get(a.session_id) || {
      session_date: "",
      location_name: "",
      course_title: "",
    }
    return {
      ...a,
      session_date: sessionInfo.session_date,
      location_name: sessionInfo.location_name,
      course_title: sessionInfo.course_title,
    }
  })
}

/**
 * Get no-show counts for a session.
 */
export async function getSessionNoShowCount(
  sessionId: string
): Promise<{ noShows: number; totalRegistered: number }> {
  const admin = createAdminClient()

  const { count: totalRegistered } = await admin
    .from("ce_attendees")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)

  const { count: noShows } = await admin
    .from("ce_attendees")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "registered")

  return {
    noShows: noShows || 0,
    totalRegistered: totalRegistered || 0,
  }
}
