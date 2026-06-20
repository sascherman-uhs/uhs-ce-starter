"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { generate785aRoster } from "@/lib/filing/roster-785a"
import { generate612cSummary } from "@/lib/filing/eval-612c"
import { draftViaOutlook } from "@/lib/email/outlook-draft"
import { draftDivisionScheduleNotice } from "@/lib/cascade/email"

// ============================================================
// Filing Server Actions — Regulator Compliance
// ============================================================
// TODO: customize for your state. These actions generate course roster +
// evaluation-summary filing documents and email drafts to a regulator. The
// form names (785a / 612C) and the submission addresses below are a Nevada
// EXAMPLE. Replace them with YOUR state's required forms and filing addresses.
// 785a roster      -> [your-roster-filing@your-state.gov] as .xlsx
// 612C eval summary -> [your-eval-filing@your-state.gov]   as PDF
// ============================================================

export type FilingActionResult = {
  success: boolean
  downloadUrl?: string
  filename?: string
  rowCount?: number
  validationIssues?: Array<{
    attendeeId?: string
    attendeeName?: string
    licenseNumber?: string
    field?: string
    issue: string
    severity: "error" | "warning"
  }>
  error?: string
}

/**
 * Generate 785a roster .xlsx for a session.
 * Uploads to Supabase Storage and returns a download URL.
 */
export async function generate785aRosterAction(
  sessionId: string
): Promise<FilingActionResult> {
  // Verify admin auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const admin = createAdminClient()

  // Fetch session with course data
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, status, ce_courses(title, course_number, credit_hours)"
    )
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return { success: false, error: "Session not found" }
  }

  const course = session.ce_courses as any
  if (!course?.course_number) {
    return { success: false, error: "No course data associated with session" }
  }

  // Fetch all attendees for this session
  const { data: attendees, error: attendeesError } = await admin
    .from("ce_attendees")
    .select(
      "id, first_name, last_name, license_number, email, status"
    )
    .eq("session_id", sessionId)
    .order("last_name", { ascending: true })

  if (attendeesError) {
    return {
      success: false,
      error: `Failed to fetch attendees: ${attendeesError.message}`,
    }
  }

  if (!attendees || attendees.length === 0) {
    return { success: false, error: "No attendees found for this session" }
  }

  try {
    // Generate the roster
    const result = await generate785aRoster(
      attendees,
      course.course_number,
      session.session_date
    )

    // Check for blocking errors
    const errors = result.validationIssues.filter((i) => i.severity === "error")
    if (errors.length > 0 && result.rowCount === 0) {
      return {
        success: false,
        error: `All roster entries have validation errors. Fix ${errors.length} issues before generating.`,
        validationIssues: result.validationIssues,
      }
    }

    // Upload to Supabase Storage
    const storagePath = `filing/${sessionId}/785a-roster.xlsx`

    const { error: uploadError } = await admin.storage
      .from("ce-assets")
      .upload(storagePath, result.buffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      })

    if (uploadError) {
      return {
        success: false,
        error: `Upload failed: ${uploadError.message}`,
      }
    }

    // Get download URL
    const { data: urlData } = admin.storage
      .from("ce-assets")
      .getPublicUrl(storagePath)

    // Update session filing status
    await admin
      .from("ce_sessions")
      .update({ roster_generated_at: new Date().toISOString() })
      .eq("id", sessionId)

    revalidatePath(`/admin/sessions/${sessionId}`)

    return {
      success: true,
      downloadUrl: urlData.publicUrl,
      filename: result.filename,
      rowCount: result.rowCount,
      validationIssues: result.validationIssues,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Roster generation failed: ${err.message}`,
    }
  }
}

/**
 * Generate 612C evaluation summary PDF for a session.
 * Uploads to Supabase Storage and returns a download URL.
 */
export async function generate612cSummaryAction(
  sessionId: string
): Promise<FilingActionResult> {
  // Verify admin auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const admin = createAdminClient()

  // Fetch session with course data
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, checked_in_count, ce_courses(title, course_number, credit_hours, instructor, sponsor)"
    )
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return { success: false, error: "Session not found" }
  }

  const course = session.ce_courses as any
  if (!course) {
    return { success: false, error: "No course data associated with session" }
  }

  // Fetch all evaluations for this session
  const { data: evaluations, error: evalsError } = await admin
    .from("ce_evaluations")
    .select("*")
    .eq("session_id", sessionId)

  if (evalsError) {
    return {
      success: false,
      error: `Failed to fetch evaluations: ${evalsError.message}`,
    }
  }

  if (!evaluations || evaluations.length === 0) {
    return {
      success: false,
      error: "No evaluations found for this session",
    }
  }

  try {
    const result = await generate612cSummary({
      courseTitle: course.title,
      courseNumber: course.course_number,
      creditHours: String(course.credit_hours),
      sessionDate: session.session_date,
      sponsor: course.sponsor || "Acme Staging Co.",
      instructor: course.instructor || "Your Name",
      licensedAttendeeCount: session.checked_in_count || 0,
      evaluations,
    })

    // Upload to Supabase Storage
    const storagePath = `filing/${sessionId}/612c-eval-summary.pdf`

    const { error: uploadError } = await admin.storage
      .from("ce-assets")
      .upload(storagePath, result.buffer, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      return {
        success: false,
        error: `Upload failed: ${uploadError.message}`,
      }
    }

    // Get download URL
    const { data: urlData } = admin.storage
      .from("ce-assets")
      .getPublicUrl(storagePath)

    // Update session filing status
    await admin
      .from("ce_sessions")
      .update({ eval_summary_generated_at: new Date().toISOString() })
      .eq("id", sessionId)

    revalidatePath(`/admin/sessions/${sessionId}`)

    return {
      success: true,
      downloadUrl: urlData.publicUrl,
      filename: result.filename,
      validationIssues: result.validationIssues.map((issue) => ({
        issue,
        severity: "warning" as const,
      })),
    }
  } catch (err: any) {
    return {
      success: false,
      error: `612C generation failed: ${err.message}`,
    }
  }
}

/**
 * Mark 785a roster as filed with the Division.
 */
export async function markFiled785a(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from("ce_sessions")
    .update({ filed_785a_at: new Date().toISOString() })
    .eq("id", sessionId)

  if (error) {
    return { success: false, error: `Failed to mark as filed: ${error.message}` }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

/**
 * Mark 612C evaluation summary as filed with the Division.
 */
export async function markFiled612c(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from("ce_sessions")
    .update({ filed_612c_at: new Date().toISOString() })
    .eq("id", sessionId)

  if (error) {
    return { success: false, error: `Failed to mark as filed: ${error.message}` }
  }

  // If both are now filed, update session status
  const { data: session } = await admin
    .from("ce_sessions")
    .select("filed_785a_at, filed_612c_at")
    .eq("id", sessionId)
    .single()

  if (session?.filed_785a_at && session?.filed_612c_at) {
    await admin
      .from("ce_sessions")
      .update({ status: "filed" })
      .eq("id", sessionId)
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true }
}

/**
 * Email 785a roster to the Division via Gmail.
 */
export async function email785aToDiv(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from("ce_sessions")
    .select("id, session_date, ce_courses(title, course_number)")
    .eq("id", sessionId)
    .single()

  if (!session) return { success: false, error: "Session not found" }
  const course = session.ce_courses as any
  // TODO: customize for your school/state — set your real state-approved course number(s); this fallback is a placeholder.
  const courseNumber = course?.course_number || "CE.0000000-RE"
  const courseTitle = course?.title || "CE Class"

  const storagePath = `filing/${sessionId}/785a-roster.xlsx`
  const { data: urlData } = admin.storage.from("ce-assets").getPublicUrl(storagePath)

  try {
    const response = await fetch(urlData.publicUrl)
    if (!response.ok) return { success: false, error: "Roster file not found. Generate it first." }
    const buffer = Buffer.from(await response.arrayBuffer())

    const result = await draftViaOutlook({
      to: "roster-filing@your-state.gov",
      subject: `Form 785a Roster — ${courseNumber} ${courseTitle}`,
      body: `Please find attached the Form 785a Course Roster for ${courseNumber} ${courseTitle}, class date ${session.session_date}.\n\nThank you,\nYour Name\nAcme Staging Co.\n555-555-5555`,
      attachments: [{
        filename: `785a-Roster_${courseNumber}_${session.session_date}.xlsx`,
        content: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    })

    if (!result.success) return { success: false, error: result.error || "Draft creation failed" }

    // Don't auto-mark as filed — user will review and send from Outlook, then mark as filed
    revalidatePath(`/admin/sessions/${sessionId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Draft 612C eval summary email for review in Outlook.
 */
export async function email612cToDiv(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from("ce_sessions")
    .select("id, session_date, ce_courses(title, course_number)")
    .eq("id", sessionId)
    .single()

  if (!session) return { success: false, error: "Session not found" }
  const course = session.ce_courses as any
  const courseNumber = course?.course_number || "CE.0000000-RE"
  const courseTitle = course?.title || "CE Class"

  const storagePath = `filing/${sessionId}/612c-eval-summary.pdf`
  const { data: urlData } = admin.storage.from("ce-assets").getPublicUrl(storagePath)

  try {
    const response = await fetch(urlData.publicUrl)
    if (!response.ok) return { success: false, error: "Eval summary not found. Generate it first." }
    const buffer = Buffer.from(await response.arrayBuffer())

    const result = await draftViaOutlook({
      to: "eval-filing@your-state.gov",
      subject: `Form 612C Eval Summary — ${courseNumber} ${courseTitle}`,
      body: `Please find attached the Form 612C Evaluation Summary for ${courseNumber} ${courseTitle}, class date ${session.session_date}.\n\nThank you,\nYour Name\nAcme Staging Co.\n555-555-5555`,
      attachments: [{
        filename: `612C-Eval-Summary_${courseNumber}_${session.session_date}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      }],
    })

    if (!result.success) return { success: false, error: result.error || "Draft creation failed" }

    // Don't auto-mark as filed — user will review and send from Outlook, then mark as filed
    revalidatePath(`/admin/sessions/${sessionId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Draft a Division schedule-notification email for an existing session.
 * Used by the "Draft Division Schedule Notice" button on the session detail page.
 * Creates a fresh Outlook draft for review (does not auto-send).
 */
export async function notifyDivisionAction(
  sessionId: string
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = createAdminClient()
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, location_address, coordinator_name, ce_courses(title, course_number, credit_hours)"
    )
    .eq("id", sessionId)
    .single()

  if (sessionError || !session) {
    return { success: false, error: "Session not found" }
  }

  const course = session.ce_courses as any
  if (!course?.course_number) {
    return { success: false, error: "Course data missing on session" }
  }

  const result = await draftDivisionScheduleNotice({
    sessionId,
    courseTitle: course.title,
    courseNumber: course.course_number,
    creditHours: course.credit_hours,
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    locationName: session.location_name,
    locationAddress: session.location_address,
    coordinatorName: session.coordinator_name,
  })

  if (!result.success) {
    return { success: false, error: result.error || "Draft creation failed" }
  }

  revalidatePath(`/admin/sessions/${sessionId}`)
  return { success: true, draftId: result.draftId }
}
