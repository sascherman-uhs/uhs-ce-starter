import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Opt out an attendee from all future CE re-engagement emails.
 * Marks ALL ce_attendees records for this email as opted_out=true.
 * This ensures they are excluded from all future no-show queries.
 */
export async function optOutAttendee(
  attendeeEmail: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("ce_attendees")
    .update({ opted_out: true })
    .eq("email", attendeeEmail)
    .select("id")

  if (error) {
    console.error("Failed to opt out attendee:", error)
    return { success: false, updatedCount: 0, error: error.message }
  }

  return { success: true, updatedCount: data?.length || 0 }
}

/**
 * Reverse an opt-out (re-subscribe an attendee).
 */
export async function optInAttendee(
  attendeeEmail: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("ce_attendees")
    .update({ opted_out: false })
    .eq("email", attendeeEmail)
    .select("id")

  if (error) {
    console.error("Failed to opt in attendee:", error)
    return { success: false, updatedCount: 0, error: error.message }
  }

  return { success: true, updatedCount: data?.length || 0 }
}

/**
 * Get all opted-out email addresses.
 */
export async function getOptedOutEmails(): Promise<string[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("ce_attendees")
    .select("email")
    .eq("opted_out", true)

  if (error) {
    console.error("Failed to fetch opted-out emails:", error)
    return []
  }

  // Deduplicate
  return Array.from(new Set((data || []).map((a) => a.email)))
}

// ============================================================
// the background worker MCP REFERENCE — Flodesk Opt-Out Sync
// ============================================================
//
// syncFlodeskOptOuts() — the background worker should periodically:
//
// 1. For each known no-show email, check Flodesk subscription status:
//    mcp__zapier__flodesk_find_a_subscriber_by_email_address({
//      email: attendeeEmail
//    })
//
// 2. If the subscriber has unsubscribed in Flodesk, sync back:
//    - Call optOutAttendee(email) to mark opted_out=true in ce_attendees
//    - Log the sync to ops_log
//
// 3. Conversely, if admin opts out via dashboard:
//    - optOutAttendee() marks the DB
//    - the background worker should then call:
//      mcp__zapier__flodesk_remove_existing_subscriber_from_segment({
//        email: attendeeEmail,
//        segment_name: "CE Re-Engagement"
//      })
//    - And optionally:
//      mcp__zapier__flodesk_unsubscribe_subscriber({
//        email: attendeeEmail
//      })
//
// This bidirectional sync ensures:
// - Flodesk CAN-SPAM unsubscribes propagate to CE dashboard (NOSHOW-05)
// - Admin opt-outs propagate to Flodesk
// - Opted-out attendees are permanently excluded (NOSHOW-06)
//
// ============================================================
