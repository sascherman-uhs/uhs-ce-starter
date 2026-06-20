/**
 * Flodesk Alumni Sync
 *
 * Queues newly certified attendees for addition to the
 * "CE Alumni: {course}" Flodesk segment. Runs automatically
 * after certificate email is sent successfully.
 *
 * Uses the existing ce_flodesk_syncs table with sync_type="alumni"
 * in metadata. a background worker picks up pending records on heartbeat and
 * calls the Zapier/Flodesk MCP tools.
 *
 * Failures here NEVER crash the certification pipeline.
 */

import { createAdminClient } from "@/lib/supabase/admin"

interface AlumniSyncParams {
  sessionId: string
  attendeeId: string
  email: string
  firstName: string
  lastName: string
  licenseNumber: string
  courseTitle: string
  courseNumber: string
  sessionDate: string
  locationName: string
}

/**
 * Queue an attendee for Flodesk alumni segment addition.
 * Called automatically after successful certificate delivery.
 *
 * a background worker picks up records where metadata.sync_type = "alumni"
 * and metadata.status = "pending", then calls:
 *   1. mcp__zapier__flodesk_create_update_subscriber (upsert contact)
 *   2. mcp__zapier__flodesk_add_existing_subscriber_to_segment
 *      (add to "CE Alumni: Listed to Sold" or course-specific segment)
 *   3. Updates metadata.status to "synced" with timestamp
 */
export async function queueAlumniSync(params: AlumniSyncParams): Promise<void> {
  try {
    const admin = createAdminClient()

    const segmentName = params.courseTitle.toLowerCase().includes("listed to sold")
      ? "CE Alumni: Listed to Sold"
      : `CE Alumni: ${params.courseTitle.slice(0, 50)}`

    const { error } = await admin
      .from("ce_flodesk_syncs")
      .insert({
        session_id: params.sessionId,
        synced_by: "auto-certification",
        attendee_count: 1,
        metadata: {
          sync_type: "alumni",
          status: "pending",
          segment_name: segmentName,
          attendee: {
            id: params.attendeeId,
            email: params.email,
            first_name: params.firstName,
            last_name: params.lastName,
            license_number: params.licenseNumber,
          },
          course: {
            title: params.courseTitle,
            number: params.courseNumber,
          },
          session_date: params.sessionDate,
          location_name: params.locationName,
        },
      })

    if (error) {
      console.error("Failed to queue alumni sync:", error.message)
      await alertAlumniSyncFailure(params, error.message)
    }
  } catch (err: any) {
    // Never throw — log and move on
    console.error("Alumni sync queue error:", err.message)
    await alertAlumniSyncFailure(params, err.message)
  }
}

async function alertAlumniSyncFailure(params: AlumniSyncParams, error: string): Promise<void> {
  // STARTER: simplified to a console log. The reference app pushed alerts to an
  // external ops pipeline (Telegram/Slack) — wire your own notifier here.
  console.error(
    `[alumni sync failure] attendee=${params.firstName} ${params.lastName} ` +
      `email=${params.email} error=${error}`
  )
}
