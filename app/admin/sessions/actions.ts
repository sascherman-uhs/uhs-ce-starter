"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { calculateFilingDeadline } from "@/lib/utils/dates"
import { format } from "date-fns"
import { generateSessionQRCodes, updateCascadeStatus } from "@/lib/qr"
import { runEmailCascade } from "@/lib/cascade/runner"
import { generateCertificate } from "@/lib/certificate/generate"
import {
  resendCertificateEmail,
  draftDivisionScheduleNotice,
  sendEvalReminderEmail,
} from "@/lib/cascade/email"
import { generateSessionFlyer } from "@/lib/cascade/flyer"
import { dollarsToCents } from "@/lib/money"
import { getPublicAppUrl } from "@/lib/public-url"
import {
  normalizeLicenseNumber,
  LICENSE_NUMBER_REGEX,
  LICENSE_NUMBER_ERROR,
} from "@/lib/registration/license"

const CreateSessionSchema = z.object({
  course_id: z.string().uuid("Please select a course"),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  location_name: z.string().min(1, "Location name is required"),
  location_address: z.string().optional(),
  coordinator_name: z.string().min(1, "Coordinator name is required"),
  coordinator_email: z.string().email("Invalid email address"),
  // Phase 8 (D-01): Optional per-session fee override in dollars-with-decimals.
  // Empty string ⇒ undefined ⇒ session inherits course.fee_cents at registration time.
  fee_dollars: z.string().optional(),

  // Phase 8 (D-11): Optional Stripe promotion code auto-applied on the registration form.
  attached_coupon_code: z.string().optional(),
})

export type CreateSessionState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function createSession(
  _prevState: CreateSessionState,
  formData: FormData
): Promise<CreateSessionState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  // Parse and validate form data
  const raw = {
    course_id: formData.get("course_id") as string,
    session_date: formData.get("session_date") as string,
    start_time: formData.get("start_time") as string,
    end_time: formData.get("end_time") as string,
    location_name: formData.get("location_name") as string,
    location_address: formData.get("location_address") as string || undefined,
    coordinator_name: formData.get("coordinator_name") as string,
    coordinator_email: formData.get("coordinator_email") as string,
    fee_dollars: (formData.get("fee_dollars") as string) || undefined,
    attached_coupon_code:
      ((formData.get("attached_coupon_code") as string) || "").trim() || undefined,
  }

  const result = CreateSessionSchema.safeParse(raw)
  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const data = result.data

  // Calculate filing deadline (3 business days after session date)
  const sessionDate = new Date(data.session_date + "T00:00:00")
  const filingDeadline = calculateFilingDeadline(sessionDate)

  // Phase 8 (D-01): Convert fee dollars → cents. Empty/undefined input ⇒ NULL on the row
  // (inherit from course.fee_cents at registration time).
  const fee_cents =
    data.fee_dollars && data.fee_dollars.trim() !== ""
      ? dollarsToCents(data.fee_dollars)
      : null

  // Phase 8 (D-11): Uppercase + trim attached coupon code if provided. Stripe codes are
  // case-insensitive but our display and metadata round-trip cleaner with consistent casing.
  const attached_coupon_code = data.attached_coupon_code
    ? data.attached_coupon_code.trim().toUpperCase()
    : null

  // Insert session with status 'scheduled'
  const admin = createAdminClient()
  const { data: session, error } = await admin
    .from("ce_sessions")
    .insert({
      course_id: data.course_id,
      session_date: data.session_date,
      start_time: data.start_time,
      end_time: data.end_time,
      location_name: data.location_name,
      location_address: data.location_address || null,
      coordinator_name: data.coordinator_name,
      coordinator_email: data.coordinator_email,
      status: "scheduled",
      filing_deadline: format(filingDeadline, "yyyy-MM-dd"),
      cascade_status: {
        qr_codes: { completed_at: null },
        flyer: { completed_at: null, canva_design_id: null },
        email: { completed_at: null, resend_id: null },
        calendar: { completed_at: null },
        division_notice: { drafted_at: null, draft_id: null },
      },
      // Phase 8 additions:
      fee_cents,
      attached_coupon_code,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Failed to create session:", error)
    return { error: `Failed to create session: ${error.message}` }
  }

  // Generate QR codes immediately (server-side, fast)
  try {
    await generateSessionQRCodes(session.id)
    await updateCascadeStatus(session.id, "qr_codes", {
      completed_at: new Date().toISOString(),
    })
  } catch (qrError) {
    console.error("QR code generation failed:", qrError)
    // Non-blocking: session is created, QR codes can be retried
  }

  // Auto-generate flyer after QR codes (needs QR for embedding)
  try {
    await generateSessionFlyer(session.id)
  } catch (flyerError) {
    console.error("Flyer generation failed:", flyerError)
    // Non-blocking: flyer can be generated manually from session detail page
  }

  // Draft coordinator scheduling email in Outlook (with PDF flyer attached).
  // Non-blocking: failures are recorded via alertEmailFailure but do not abort.
  try {
    await runEmailCascade(session.id)
  } catch (emailError) {
    console.error("Coordinator email draft failed:", emailError)
  }

  // Draft Division schedule-notification email to schedule-filing@your-state.gov.
  // NRED requires sponsors to notify the Division when a class is scheduled.
  // Non-blocking: failures are recorded via alertEmailFailure but do not
  // abort session creation. User reviews and sends manually from Outlook.
  try {
    // Re-fetch the joined course row for the notice (we only have ids in scope).
    const { data: courseRow } = await admin
      .from("ce_courses")
      .select("title, course_number, credit_hours")
      .eq("id", data.course_id)
      .single()

    if (courseRow) {
      await draftDivisionScheduleNotice({
        sessionId: session.id,
        courseTitle: courseRow.title,
        courseNumber: courseRow.course_number,
        creditHours: courseRow.credit_hours,
        sessionDate: data.session_date,
        startTime: data.start_time,
        endTime: data.end_time,
        locationName: data.location_name,
        locationAddress: data.location_address || null,
        coordinatorName: data.coordinator_name,
      })
    }
  } catch (divisionError) {
    console.error("Division schedule-notification draft failed:", divisionError)
    // Non-blocking: alertEmailFailure already fired inside draftDivisionScheduleNotice
    // for handled errors. This catch covers thrown errors from the course re-fetch.
  }

  // Redirect to session detail page
  redirect(`/admin/sessions/${session.id}`)
}

// ============================================================
// UPDATE PRICING (admin-only) — set/change fee + pre-applied coupon
// on an already-created session (Phase 8 fee is otherwise creation-only).
// ============================================================

export type UpdatePricingState = {
  success?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function updateSessionPricing(
  sessionId: string,
  _prevState: UpdatePricingState,
  formData: FormData
): Promise<UpdatePricingState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const feeRaw = ((formData.get("fee_dollars") as string) || "").trim()
  const couponRaw = ((formData.get("attached_coupon_code") as string) || "").trim()

  // Empty fee ⇒ NULL (inherit course.fee_cents at registration time);
  // otherwise dollars → integer cents (canonical money path, no parseFloat/toFixed).
  let fee_cents: number | null = null
  if (feeRaw !== "") {
    if (!/^\$?\d*\.?\d{0,2}$/.test(feeRaw)) {
      return { fieldErrors: { fee_dollars: ["Enter a dollar amount like 10 or 10.00"] } }
    }
    fee_cents = dollarsToCents(feeRaw)
    if (fee_cents < 0) {
      return { fieldErrors: { fee_dollars: ["Fee cannot be negative"] } }
    }
  }

  const attached_coupon_code = couponRaw ? couponRaw.toUpperCase() : null

  const admin = createAdminClient()
  const { error } = await admin
    .from("ce_sessions")
    .update({ fee_cents, attached_coupon_code })
    .eq("id", sessionId)

  if (error) {
    console.error("Failed to update session pricing:", error)
    return { error: `Failed to update pricing: ${error.message}` }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

// ============================================================
// MANUAL CHECK-IN (admin-only, bypasses time window)
// ============================================================

export type ManualCheckInState = {
  success?: boolean
  error?: string
}

export async function manualCheckIn(
  _prevState: ManualCheckInState,
  formData: FormData
): Promise<ManualCheckInState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  const attendeeId = formData.get("attendee_id") as string

  if (!sessionId || !attendeeId) {
    return { error: "Missing session or attendee ID" }
  }

  const admin = createAdminClient()

  // Get attendee
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, license_number, status")
    .eq("id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (attendeeError || !attendee) {
    return { error: "Attendee not found" }
  }

  // Already checked in
  if (
    attendee.status === "checked_in" ||
    attendee.status === "evaluated" ||
    attendee.status === "certified"
  ) {
    return { error: "Already checked in" }
  }

  // Insert ce_check_ins record
  const { error: checkInError } = await admin.from("ce_check_ins").insert({
    session_id: sessionId,
    attendee_id: attendee.id,
  })

  if (checkInError) {
    if (
      checkInError.code === "23505" ||
      checkInError.message?.includes("duplicate")
    ) {
      // Already has a check-in record, just update attendee status
    } else {
      console.error("Manual check-in insert failed:", checkInError)
      return { error: "Check-in failed. Please try again." }
    }
  }

  // Update attendee status
  await admin
    .from("ce_attendees")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", attendee.id)

  // Increment checked_in_count
  try {
    await admin.rpc("increment_checked_in_count", {
      p_session_id: sessionId,
    })
  } catch {
    try {
      const { data: currentSession } = await admin
        .from("ce_sessions")
        .select("checked_in_count")
        .eq("id", sessionId)
        .single()
      if (currentSession) {
        await admin
          .from("ce_sessions")
          .update({
            checked_in_count: (currentSession.checked_in_count || 0) + 1,
          })
          .eq("id", sessionId)
      }
    } catch (countErr) {
      console.error("Failed to increment checked_in_count:", countErr)
    }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

export type SendEmailState = {
  success?: boolean
  error?: string
}

export async function sendCoordinatorEmailAction(
  _prevState: SendEmailState,
  formData: FormData
): Promise<SendEmailState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  if (!sessionId) {
    return { error: "Missing session ID" }
  }

  const result = await runEmailCascade(sessionId)

  if (!result.success) {
    return { error: result.error || "Failed to send email" }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

/**
 * Mark coordinator email as sent (for emails sent via Outlook/external worker).
 * Updates cascade status without trying to send via Resend.
 */
export async function markCoordinatorEmailSent(
  _prevState: SendEmailState,
  formData: FormData
): Promise<SendEmailState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  if (!sessionId) {
    return { error: "Missing session ID" }
  }

  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select("cascade_status")
    .eq("id", sessionId)
    .single()

  const cascade = (session?.cascade_status as Record<string, any>) || {}
  cascade.email = {
    completed_at: new Date().toISOString(),
    sent_via: "outlook",
  }

  await admin
    .from("ce_sessions")
    .update({ cascade_status: cascade })
    .eq("id", sessionId)

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

// ============================================================
// RESEND / GENERATE CERTIFICATE (admin-only)
// ============================================================

export type ResendCertState = {
  success?: boolean
  error?: string
}

export async function resendCertificate(
  _prevState: ResendCertState,
  formData: FormData
): Promise<ResendCertState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  const attendeeId = formData.get("attendee_id") as string

  if (!sessionId || !attendeeId) {
    return { error: "Missing session or attendee ID" }
  }

  const admin = createAdminClient()

  // Look up attendee
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, email, license_number, status")
    .eq("id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (attendeeError || !attendee) {
    return { error: "Attendee not found" }
  }

  if (attendee.status !== "certified" && attendee.status !== "evaluated") {
    return { error: "Attendee must be evaluated or certified" }
  }

  // Look up session + course info
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, ce_courses(title, course_number, credit_hours, instructor, sponsor)"
    )
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return { error: "Session not found" }
  }

  const courses = session.ce_courses as unknown as
    | { title: string; course_number: string; credit_hours: number; instructor: string; sponsor: string }
    | { title: string; course_number: string; credit_hours: number; instructor: string; sponsor: string }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses

  const attendeeName = `${attendee.first_name} ${attendee.last_name}`
  const courseTitle = course?.title || "CE Class"
  // TODO: customize for your school/state — set your real state-approved course number(s); this fallback is a placeholder.
  const courseNumber = course?.course_number || "CE.0000000-RE"
  const creditHours = String(course?.credit_hours || 3)

  // Step 1: Check for existing certificate
  let pdfUrl: string | null = null

  const { data: existingCert } = await admin
    .from("ce_certificates")
    .select("id, pdf_url, pdf_storage_path")
    .eq("attendee_id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (existingCert?.pdf_url) {
    pdfUrl = existingCert.pdf_url
  }

  // Step 2: If no PDF exists, regenerate it
  if (!pdfUrl) {
    try {
      const certResult = await generateCertificate({
        sessionId,
        attendeeId,
        attendeeName,
        licenseNumber: attendee.license_number,
        courseTitle,
        courseNumber,
        creditHours,
        sessionDate: session.session_date,
        sponsor: course?.sponsor || "Acme Staging Co.",
        instructor: course?.instructor || "Your Name",
      })
      pdfUrl = certResult.pdfUrl
    } catch (err: any) {
      console.error("Certificate generation failed:", err)
      return { error: `Certificate generation failed: ${err.message}` }
    }
  }

  // Step 3: Send via Resend immediately
  const emailResult = await resendCertificateEmail({
    sessionId,
    attendeeEmail: attendee.email,
    attendeeName,
    courseTitle,
    courseNumber,
    creditHours,
    sessionDate: session.session_date,
    pdfUrl,
  })

  if (!emailResult.success) {
    return { error: `Email failed: ${emailResult.error}` }
  }

  // Step 4: Update certificate record
  if (existingCert) {
    await admin
      .from("ce_certificates")
      .update({
        delivery_status: "resent",
        delivered_at: new Date().toISOString(),
        delivery_error: null,
      })
      .eq("id", existingCert.id)
  }

  // Step 5: If attendee was 'evaluated' (missed cert), promote to 'certified'
  if (attendee.status === "evaluated") {
    await admin
      .from("ce_attendees")
      .update({
        status: "certified",
        certified_at: new Date().toISOString(),
      })
      .eq("id", attendee.id)
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

// ============================================================
// EMAIL EVAL LINK (admin-only)
// ============================================================
//
// Emails a CHECKED-IN attendee a branded reminder containing a deep link
// straight into their evaluation form (license pre-filled, gate skipped), so
// they can complete the eval and receive their CE certificate. Used when a
// student re-registered via the registration QR instead of evaluating.
//
// Status guards (exact messages are part of acceptance):
//   - registered            → "… has not checked in yet — check them in first"
//   - evaluated / certified → "Already evaluated — certificate was sent"
//   - only checked_in proceeds to send.
//
// The deep-link host comes from getPublicAppUrl() (durable outward artifact —
// an email opened on a phone must never see localhost; never the env-driven
// dev URL, per quick 260610-6rq). Reuses the existing SendEmailState type.
// ============================================================

export async function sendEvalReminderAction(
  _prevState: SendEmailState,
  formData: FormData
): Promise<SendEmailState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  const attendeeId = formData.get("attendee_id") as string

  if (!sessionId || !attendeeId) {
    return { error: "Missing session or attendee ID" }
  }

  const admin = createAdminClient()

  // Look up attendee
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, email, license_number, status")
    .eq("id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (attendeeError || !attendee) {
    return { error: "Attendee not found" }
  }

  // Status guards — only a checked_in attendee can be sent the eval link.
  if (attendee.status === "registered") {
    return {
      error: `${attendee.first_name} ${attendee.last_name} has not checked in yet — check them in first`,
    }
  }
  if (attendee.status === "evaluated" || attendee.status === "certified") {
    return { error: "Already evaluated — certificate was sent" }
  }

  // Look up session + course info
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select("id, session_date, ce_courses(title, course_number, credit_hours)")
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return { error: "Session not found" }
  }

  const courses = session.ce_courses as unknown as
    | { title: string; course_number: string; credit_hours: number }
    | { title: string; course_number: string; credit_hours: number }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses

  const courseTitle = course?.title || "CE Class"
  const courseNumber = course?.course_number || "CE.0000000-RE"
  const creditHours = String(course?.credit_hours || 3)

  // Build the eval deep link. Durable outward artifact → getPublicAppUrl()
  // (hard-throws on localhost; never the env-driven dev URL). encodeURIComponent
  // guards the license dot/format. A checked_in attendee landing on this URL
  // skips the gate with their license pre-filled (verified live in
  // app/form/eval/[sessionId]/page.tsx).
  const evalUrl = `${getPublicAppUrl()}/form/eval/${sessionId}?license=${encodeURIComponent(
    attendee.license_number
  )}`

  const emailResult = await sendEvalReminderEmail({
    sessionId,
    attendeeEmail: attendee.email,
    attendeeName: `${attendee.first_name} ${attendee.last_name}`,
    licenseNumber: attendee.license_number,
    courseTitle,
    courseNumber,
    creditHours,
    sessionDate: session.session_date,
    evalUrl,
  })

  if (!emailResult.success) {
    return { error: `Email failed: ${emailResult.error}` }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

// ============================================================
// REMOVE ATTENDEE (admin-only)
// ============================================================

export type RemoveAttendeeState = {
  success?: boolean
  error?: string
}

export async function removeAttendee(
  _prevState: RemoveAttendeeState,
  formData: FormData
): Promise<RemoveAttendeeState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  const attendeeId = formData.get("attendee_id") as string

  if (!sessionId || !attendeeId) {
    return { error: "Missing session or attendee ID" }
  }

  const admin = createAdminClient()

  // Verify attendee exists and belongs to this session
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, status, first_name, last_name")
    .eq("id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (attendeeError || !attendee) {
    return { error: "Attendee not found" }
  }

  // Delete related records first (check-ins, evaluations, certificates)
  await admin.from("ce_check_ins").delete().eq("attendee_id", attendeeId)
  await admin.from("ce_evaluations").delete().eq("attendee_id", attendeeId)
  await admin.from("ce_certificates").delete().eq("attendee_id", attendeeId)

  // Delete the attendee
  const { error: deleteError } = await admin
    .from("ce_attendees")
    .delete()
    .eq("id", attendeeId)

  if (deleteError) {
    console.error("Failed to remove attendee:", deleteError)
    return { error: `Failed to remove attendee: ${deleteError.message}` }
  }

  // Recompute the session's denormalized lifecycle counters from truth.
  // (Replaces the old read-modify-write decrement block, which never
  // decremented evaluated_count — see quick 260610-ard.) Every ce_attendees
  // row is a registrant; checked_in/evaluated are lifecycle supersets keyed on
  // their timestamp columns. Recomputing all three is self-healing: any
  // pre-existing drift on this session corrects here on the next removal.
  // Non-blocking: the removal already succeeded; a counter hiccup only logs.
  try {
    const [registered, checkedIn, evaluated] = await Promise.all([
      admin
        .from("ce_attendees")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId),
      admin
        .from("ce_attendees")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .not("checked_in_at", "is", null),
      admin
        .from("ce_attendees")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .not("evaluated_at", "is", null),
    ])

    await admin
      .from("ce_sessions")
      .update({
        registered_count: registered.count ?? 0,
        checked_in_count: checkedIn.count ?? 0,
        evaluated_count: evaluated.count ?? 0,
      })
      .eq("id", sessionId)
  } catch (countErr) {
    console.error("Failed to recompute session counts after removal:", countErr)
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

// ============================================================
// GENERATE FLYER (admin-only)
// ============================================================

export type GenerateFlyerState = {
  success?: boolean
  error?: string
  flyerUrl?: string
}

export async function generateFlyer(
  _prevState: GenerateFlyerState,
  formData: FormData
): Promise<GenerateFlyerState> {
  // Verify admin is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const sessionId = formData.get("session_id") as string
  if (!sessionId) {
    return { error: "Missing session ID" }
  }

  try {
    const flyerUrl = await generateSessionFlyer(sessionId)
    revalidatePath(`/admin/sessions/${sessionId}`)
    return { success: true, flyerUrl }
  } catch (err: any) {
    console.error("Flyer generation failed:", err)
    return { error: `Flyer generation failed: ${err.message}` }
  }
}

// ============================================================
// ADD / EDIT ATTENDEE (admin-only)
//
// addAttendee:    insert a walk-in attendee ($0/comp) AND increment the
//                 denormalized ce_sessions.registered_count atomically — the
//                 public registration form is the only OTHER place that
//                 increments it, so a direct insert without this would go stale.
// updateAttendee: fix typos in the 5 identity/contact fields before the 785a
//                 filing. NEVER touches registered_count, status, payment/Stripe
//                 columns, or check-in/evaluation timestamps (they are simply
//                 absent from the update payload).
//
// No Stripe/payment/coupon handling on either path: addAttendee hardcodes
// paid_amount_cents: 0; updateAttendee's payload contains no payment columns.
// Both share ONE Zod schema so add and edit validation can never diverge.
// ============================================================

const AttendeeFieldsSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  license_number: z
    .string()
    .min(1, "License number is required")
    .regex(LICENSE_NUMBER_REGEX, LICENSE_NUMBER_ERROR),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
})

export type AddAttendeeState = {
  success?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}
export type UpdateAttendeeState = AddAttendeeState

export async function addAttendee(
  _prevState: AddAttendeeState,
  formData: FormData
): Promise<AddAttendeeState> {
  const sessionId = formData.get("session_id") as string
  if (!sessionId) {
    return { error: "Missing session ID" }
  }

  // Auth gate (mirrors removeAttendee)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  // Normalize + validate (mirrors the public register action's pre-parse)
  const raw = {
    first_name: (formData.get("first_name") as string)?.trim(),
    last_name: (formData.get("last_name") as string)?.trim(),
    license_number: normalizeLicenseNumber(
      (formData.get("license_number") as string) || ""
    ),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
  }

  const result = AttendeeFieldsSchema.safeParse(raw)
  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    }
  }

  const data = result.data
  const admin = createAdminClient()

  // Insert as a free/comp attendee. Duplicate license is caught by the DB
  // UNIQUE(session_id, license_number) constraint — do NOT pre-SELECT.
  const { error: insertError } = await admin.from("ce_attendees").insert({
    session_id: sessionId,
    first_name: data.first_name,
    last_name: data.last_name,
    license_number: data.license_number,
    email: data.email,
    phone: data.phone || null,
    status: "registered",
    paid_amount_cents: 0,
  })

  if (insertError) {
    if (
      insertError.code === "23505" ||
      insertError.message?.includes("duplicate") ||
      insertError.message?.includes("unique")
    ) {
      return {
        error:
          "An attendee with that license number is already registered for this session.",
      }
    }
    console.error("Admin add-attendee insert failed:", insertError)
    return { error: "Failed to add attendee. Please try again." }
  }

  // Increment registered_count — verbatim RPC-with-manual-fallback block
  // (identical to app/form/register/actions.ts + lib/stripe/fulfill.ts).
  // Runs ONLY after a successful insert, so a rejected duplicate never changes
  // the count.
  try {
    await admin.rpc("increment_registered_count", {
      p_session_id: sessionId,
    })
  } catch {
    try {
      const { data: currentSession } = await admin
        .from("ce_sessions")
        .select("registered_count")
        .eq("id", sessionId)
        .single()
      if (currentSession) {
        await admin
          .from("ce_sessions")
          .update({
            registered_count: (currentSession.registered_count || 0) + 1,
          })
          .eq("id", sessionId)
      }
    } catch (countErr) {
      console.error("Failed to increment registered_count:", countErr)
    }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

export async function updateAttendee(
  _prevState: UpdateAttendeeState,
  formData: FormData
): Promise<UpdateAttendeeState> {
  const sessionId = formData.get("session_id") as string
  const attendeeId = formData.get("attendee_id") as string
  if (!sessionId || !attendeeId) {
    return { error: "Missing session or attendee ID" }
  }

  // Auth gate (mirrors removeAttendee)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  // Normalize + validate with the SAME schema add uses (reuse, don't redefine).
  const raw = {
    first_name: (formData.get("first_name") as string)?.trim(),
    last_name: (formData.get("last_name") as string)?.trim(),
    license_number: normalizeLicenseNumber(
      (formData.get("license_number") as string) || ""
    ),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
  }

  const result = AttendeeFieldsSchema.safeParse(raw)
  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    }
  }

  const data = result.data
  const admin = createAdminClient()

  // Verify-first: the attendee must exist and belong to this session.
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id")
    .eq("id", attendeeId)
    .eq("session_id", sessionId)
    .single()

  if (attendeeError || !attendee) {
    return { error: "Attendee not found" }
  }

  // Update ONLY the 5 editable fields. Status, payment/Stripe columns, and
  // checked_in_at/evaluated_at/certified_at are untouched — they are simply
  // not in this payload. NO counter changes anywhere (an edit is not a
  // registration).
  const { error: updateError } = await admin
    .from("ce_attendees")
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      license_number: data.license_number,
      email: data.email,
      phone: data.phone || null,
    })
    .eq("id", attendeeId)
    .eq("session_id", sessionId)

  if (updateError) {
    // The UNIQUE(session_id, license_number) constraint fires on UPDATE
    // collisions too. Updating a row to its OWN current license does not
    // collide with itself, so no special-casing is needed.
    if (
      updateError.code === "23505" ||
      updateError.message?.includes("duplicate") ||
      updateError.message?.includes("unique")
    ) {
      return {
        error:
          "Another attendee in this session already has that license number.",
      }
    }
    console.error("Admin update-attendee failed:", updateError)
    return { error: "Failed to update attendee. Please try again." }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}
