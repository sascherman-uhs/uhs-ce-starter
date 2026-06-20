/**
 * Google Calendar Event Creation -- MCP Workflow Reference
 *
 * This module documents the Google Calendar MCP steps the background worker executes.
 * These functions are NOT callable from Next.js -- they require
 * Claude Code MCP tools at runtime.
 *
 * the background worker Workflow:
 * 1. mcp__google-calendar__create-event({
 *      account: "primary",
 *      // Use a dedicated shared calendar (not the account's "primary") so other
 *      // tools/people see the bookings and you avoid double-bookings.
 *      // TODO: your Google Calendar ID — Google Calendar settings > Integrate calendar > Calendar ID
 *      calendarId: "YOUR-CALENDAR-ID@group.calendar.google.com",
 *      title: "CE - {location_name} | {coordinator_name}",
 *      // Block 30 min of travel on each side of the 3-hour class.
 *      start: "{session_date}T{start_time MINUS 30 min}:00",
 *      end: "{session_date}T{end_time PLUS 30 min}:00",
 *      timeZone: "America/Los_Angeles",
 *      transparency: "opaque", // BUSY — blocks the time so nothing overlaps
 *      location: "{location_address}",
 *      description: "Course: {course_title}\nClass time: {start_time}-{end_time} (calendar blocked 30 min earlier/later for travel)\nCoordinator: {coordinator_name} ({coordinator_email})\nRegistration: {registration_url}"
 *    })
 *
 * 2. Record the returned event ID on the session
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { updateCascadeStatus } from "@/lib/qr"

/**
 * Update session with calendar event ID after the background worker creates the event via MCP.
 * Called by the background worker after creating the Google Calendar event.
 */
export async function recordCalendarCompletion(
  sessionId: string,
  calendarEventId: string
): Promise<void> {
  const admin = createAdminClient()

  // Update the session's calendar_event_id
  const { error } = await admin
    .from("ce_sessions")
    .update({ calendar_event_id: calendarEventId })
    .eq("id", sessionId)

  if (error) {
    throw new Error(`Failed to update calendar_event_id: ${error.message}`)
  }

  // Update cascade status
  await updateCascadeStatus(sessionId, "calendar", {
    completed_at: new Date().toISOString(),
  })
}
