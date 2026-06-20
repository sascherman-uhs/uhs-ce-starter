import { createAdminClient } from "@/lib/supabase/admin"
import { getPublicAppUrl } from "@/lib/public-url"
import { draftCoordinatorEmailViaOutlook } from "./email"

/**
 * Run the email step of the cascade for a session: drafts the coordinator
 * scheduling email in Scott's Outlook (review-before-send pattern, mirrors
 * the Division Notice flow). Attaches the generated PDF flyer if available.
 *
 * QR codes / Canva flyer / Division Notice: handled inside createSession.
 * Calendar: still requires the background worker or a Google Calendar API integration.
 */
export async function runEmailCascade(sessionId: string): Promise<{
  success: boolean
  draftId?: string
  error?: string
}> {
  const admin = createAdminClient()

  const { data: session, error: fetchError } = await admin
    .from("ce_sessions")
    .select("*, ce_courses(title)")
    .eq("id", sessionId)
    .single()

  if (fetchError || !session) {
    return { success: false, error: `Session not found: ${fetchError?.message}` }
  }

  const course = session.ce_courses as any
  // Durable: this string is rendered into the coordinator scheduling email body.
  const registrationUrl = `${getPublicAppUrl()}/form/register/${sessionId}`

  return draftCoordinatorEmailViaOutlook({
    sessionId,
    courseTitle: course?.title || "CE Class",
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    locationName: session.location_name,
    locationAddress: session.location_address,
    coordinatorName: session.coordinator_name,
    coordinatorEmail: session.coordinator_email,
    registrationUrl,
    flyerPngUrl: session.flyer_url,
  })
}

/**
 * Get the full cascade state and session data needed for the background worker
 * to run the MCP steps (Canva + Calendar).
 */
export async function getCascadeContext(sessionId: string): Promise<{
  session: any
  course: any
  registrationQrUrl: string
  registrationFormUrl: string
  pendingSteps: string[]
} | null> {
  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select("*, ce_courses(*)")
    .eq("id", sessionId)
    .single()

  if (!session) return null

  const cascade = (session.cascade_status as any) || {}
  const pendingSteps: string[] = []

  if (!cascade.qr_codes?.completed_at) pendingSteps.push("qr_codes")
  if (!cascade.flyer?.completed_at) pendingSteps.push("flyer")
  if (!cascade.email?.completed_at) pendingSteps.push("email")
  if (!cascade.calendar?.completed_at) pendingSteps.push("calendar")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // registrationQrUrl is a Supabase STORAGE url (not an app origin) — leave it.
  const registrationQrUrl = `${supabaseUrl}/storage/v1/object/public/ce-assets/qr/${sessionId}/registration.png`
  // Durable: consumed by the background worker outward cascade steps (Canva flyer / Calendar).
  const registrationFormUrl = `${getPublicAppUrl()}/form/register/${sessionId}`

  return {
    session,
    course: session.ce_courses,
    registrationQrUrl,
    registrationFormUrl,
    pendingSteps,
  }
}
