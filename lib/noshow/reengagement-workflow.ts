/**
 * CE Re-Engagement Workflow — Reference Document
 *
 * This file documents the full re-engagement workflow that the background worker executes
 * when a new CE session is created. It is NOT called by the web app directly —
 * it serves as the specification for background-worker integration.
 *
 * Trigger: New session created via /schedule-ce or admin dashboard
 * Owner: background worker (autonomous, with logging)
 */

// ============================================================
// WORKFLOW: New Session -> Re-Engage No-Shows
// ============================================================
//
// When a new CE session is created (via createSession() or /schedule-ce):
//
// STEP 1: Query global no-shows
// ─────────────────────────────
// import { getGlobalNoShows } from "@/lib/noshow/identify"
//
// const noShows = await getGlobalNoShows()
// // Returns all no-shows across completed sessions, excluding opted_out
//
//
// STEP 2: Prepare Flodesk subscriber data
// ────────────────────────────────────────
// For each no-show, build merge fields with new session details:
//
// const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
// const subscribers = noShows.map(ns => ({
//   email: ns.email,
//   first_name: ns.first_name,
//   last_name: ns.last_name,
//   custom_fields: {
//     last_class_missed: `${ns.course_title} - ${ns.session_date} at ${ns.location_name}`,
//     next_class_date: newSession.session_date,       // e.g. "2026-04-15"
//     next_class_location: newSession.location_name,   // e.g. "Realty ONE Group"
//     registration_link: `${APP_URL}/form/register/${newSession.id}`,
//     license_number: ns.license_number,
//   }
// }))
//
//
// STEP 3: Push to Flodesk via MCP
// ────────────────────────────────
// For each subscriber:
//
//   a) Create/update subscriber with merge fields:
//      mcp__zapier__flodesk_create_update_subscriber({
//        email: subscriber.email,
//        first_name: subscriber.first_name,
//        last_name: subscriber.last_name,
//        custom_fields: subscriber.custom_fields
//      })
//
//   b) Add to CE Re-Engagement segment:
//      mcp__zapier__flodesk_add_existing_subscriber_to_segment({
//        email: subscriber.email,
//        segment_name: "CE Re-Engagement"
//      })
//
//
// STEP 4: Flodesk auto-triggers email
// ────────────────────────────────────
// The "New CE Class Available" email template in Flodesk is configured
// to auto-send when subscribers are added to the "CE Re-Engagement" segment.
//
// Template merge fields:
//   {{ first_name }}         — Attendee first name
//   {{ last_class_missed }}  — What they missed: "Listed to Sold - Jan 29 at XYZ Realty"
//   {{ next_class_date }}    — When the new class is
//   {{ next_class_location }} — Where the new class is
//   {{ registration_link }}  — Direct link to register
//
// Flodesk handles:
//   - CAN-SPAM compliant unsubscribe link
//   - Email delivery and tracking
//   - Bounce handling
//
//
// STEP 5: Record the sync
// ───────────────────────
// import { recordFlodeskSync } from "@/lib/noshow/flodesk"
//
// await recordFlodeskSync("global", {
//   targetSessionId: newSession.id,
//   syncedBy: "worker",
//   attendeeCount: subscribers.length,
// })
//
//
// STEP 6: Log to ops_log
// ──────────────────────
// INSERT INTO ops_log (event_type, source, message, metadata)
// VALUES (
//   'ce_reengagement',
//   'worker',
//   'Pushed ${subscribers.length} no-shows to Flodesk for new session at ${newSession.location_name}',
//   '{"new_session_id": "${newSession.id}", "count": ${subscribers.length}}'
// )
//
//
// ============================================================
// the background worker SKILL INTEGRATION
// ============================================================
//
// The /schedule-ce skill should include this as a post-creation step:
//
// After session creation + QR codes + flyer + email + calendar:
//   1. Check if there are any global no-shows
//   2. If yes, run the re-engagement workflow above
//   3. Report in session summary: "Also re-engaged X previous no-shows"
//
// The admin dashboard "Sync to Flodesk" button:
//   1. Calls recordFlodeskSync() to create a pending sync record
//   2. a background worker picks up pending syncs during heartbeat/session
//   3. Executes the MCP calls above
//   4. Updates sync record metadata.status = "completed"
//
// ============================================================
// OPT-OUT SYNC (Bidirectional)
// ============================================================
//
// the background worker should periodically (daily or per-session):
//
// 1. Check Flodesk for unsubscribes in "CE Re-Engagement" segment
// 2. For each unsubscribe, call optOutAttendee(email)
// 3. This ensures NOSHOW-05 and NOSHOW-06 compliance
//
// See lib/noshow/opt-out.ts for the reverse direction (dashboard -> Flodesk).
//

export {}
