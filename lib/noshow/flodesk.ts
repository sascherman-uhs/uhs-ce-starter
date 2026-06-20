/**
 * Flodesk Integration for CE No-Show Re-Engagement
 *
 * Flodesk is accessible only via Zapier MCP tools (mcp__zapier__flodesk_*).
 * This module provides:
 *   1. Helper functions to record sync intent from the admin dashboard
 *   2. Reference documentation for background-worker runtime API calls
 *
 * The actual Flodesk API calls happen in a background worker, not in the web app.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionNoShows, getGlobalNoShows } from "./identify"

// ============================================================
// TYPES
// ============================================================

export type FlodeskSyncResult = {
  success: boolean
  syncId?: string
  attendeeCount?: number
  error?: string
}

export type FlodeskSubscriberFields = {
  email: string
  first_name: string
  last_name: string
  custom_fields: {
    last_class_missed: string // "Listed to Sold - Jan 29, 2026 at Berkshire Hathaway"
    next_class_date: string // "April 15, 2026"
    next_class_location: string // "Realty ONE Group"
    registration_link: string // Full URL to registration form
    license_number: string
  }
}

// ============================================================
// DATABASE SYNC TRACKING
// ============================================================

/**
 * Record that no-shows for a session were synced (or queued for sync) to Flodesk.
 * Called from the admin dashboard when "Sync to Flodesk" is clicked.
 * a background worker picks up pending syncs and executes the MCP calls.
 */
export async function recordFlodeskSync(
  sessionId: string,
  options?: {
    targetSessionId?: string // The new session being promoted
    syncedBy?: string
    attendeeCount?: number
  }
): Promise<FlodeskSyncResult> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("ce_flodesk_syncs")
    .insert({
      session_id: sessionId,
      synced_by: options?.syncedBy || "admin",
      attendee_count: options?.attendeeCount || 0,
      target_session_id: options?.targetSessionId || null,
      metadata: { status: "pending" },
    })
    .select("id")
    .single()

  if (error) {
    console.error("Failed to record Flodesk sync:", error)
    return { success: false, error: error.message }
  }

  return {
    success: true,
    syncId: data.id,
    attendeeCount: options?.attendeeCount,
  }
}

/**
 * Get sync history for a session.
 */
export async function getFlodeskSyncHistory(sessionId: string) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("ce_flodesk_syncs")
    .select("*")
    .eq("session_id", sessionId)
    .order("synced_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch sync history:", error)
    return []
  }

  return data || []
}

/**
 * Check if no-shows for a session have already been synced.
 */
export async function hasBeenSynced(sessionId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { count } = await admin
    .from("ce_flodesk_syncs")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)

  return (count || 0) > 0
}

// ============================================================
// the background worker MCP REFERENCE — Flodesk Push Workflow
// ============================================================
//
// When the background worker executes a no-show sync, it should:
//
// 1. Call getSessionNoShows(sessionId) or getGlobalNoShows() to get the list
//
// 2. For each no-show attendee, call:
//    mcp__zapier__flodesk_create_update_subscriber({
//      email: attendee.email,
//      first_name: attendee.first_name,
//      last_name: attendee.last_name,
//      custom_fields: {
//        last_class_missed: `${courseName} - ${formattedDate} at ${locationName}`,
//        next_class_date: newSession.formattedDate,
//        next_class_location: newSession.locationName,
//        registration_link: `${APP_URL}/form/register/${newSession.id}`,
//        license_number: attendee.license_number,
//      }
//    })
//
// 3. After creating/updating the subscriber, add to segment:
//    mcp__zapier__flodesk_add_existing_subscriber_to_segment({
//      email: attendee.email,
//      segment_name: "CE Re-Engagement"
//    })
//
// 4. Record the sync:
//    recordFlodeskSync(sessionId, {
//      targetSessionId: newSessionId,
//      syncedBy: "worker",
//      attendeeCount: noShows.length,
//    })
//
// 5. Log to ops_log:
//    INSERT INTO ops_log (event_type, source, message, metadata)
//    VALUES ('flodesk_sync', 'worker',
//      'Synced N no-shows to Flodesk CE Re-Engagement segment',
//      '{"session_id": "...", "target_session_id": "...", "count": N}')
//
// ============================================================

/**
 * Prepare the subscriber data for Flodesk push.
 * Used by the worker to format data before MCP calls.
 */
export async function prepareFlodeskSubscribers(
  sessionId: string,
  newSessionDetails?: {
    id: string
    session_date: string
    location_name: string
    course_title: string
    registration_url: string
  }
): Promise<FlodeskSubscriberFields[]> {
  const noShows = await getSessionNoShows(sessionId)

  return noShows
    .filter((a) => !a.opted_out)
    .map((a) => ({
      email: a.email,
      first_name: a.first_name,
      last_name: a.last_name,
      custom_fields: {
        last_class_missed: `${a.course_title || "CE Class"} - ${a.session_date} at ${a.location_name}`,
        next_class_date: newSessionDetails?.session_date || "TBD",
        next_class_location: newSessionDetails?.location_name || "TBD",
        registration_link: newSessionDetails?.registration_url || "",
        license_number: a.license_number,
      },
    }))
}
