"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeLicenseNumber } from "@/lib/registration/license"
import { redirect } from "next/navigation"
import { z } from "zod"

const CheckInSchema = z.object({
  session_id: z.string().uuid("Invalid session"),
  license_number: z
    .string()
    .min(1, "License number is required")
    .regex(
      /^(S|BS|B|PM|PB)\.\d{1,7}$/,
      "Invalid format. Use prefix.numbers (e.g., S.1234567)"
    ),
})

export type CheckInState = {
  error?: string
  notRegistered?: boolean
  alreadyCheckedIn?: boolean
  attendeeName?: string
}

export async function checkInForSession(
  _prevState: CheckInState,
  formData: FormData
): Promise<CheckInState> {
  const raw = {
    session_id: formData.get("session_id") as string,
    license_number: normalizeLicenseNumber(
      (formData.get("license_number") as string) ?? ""
    ),
  }

  const result = CheckInSchema.safeParse(raw)
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    const firstError =
      fieldErrors.license_number?.[0] || fieldErrors.session_id?.[0]
    return { error: firstError || "Invalid input" }
  }

  const data = result.data
  const admin = createAdminClient()

  // Verify session exists and is active
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select("id, session_date, status")
    .eq("id", data.session_id)
    .single()

  if (sessionError || !session) {
    return { error: "Session not found." }
  }

  if (session.status === "draft" || session.status === "cancelled") {
    return { error: "This session is not accepting check-ins." }
  }

  // Time window check: only allow on session_date (date-only comparison)
  const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD in UTC
  // Also get local Pacific date for comparison
  const pacificNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  )
  const pacificToday = `${pacificNow.getFullYear()}-${String(pacificNow.getMonth() + 1).padStart(2, "0")}-${String(pacificNow.getDate()).padStart(2, "0")}`

  if (session.session_date !== today && session.session_date !== pacificToday) {
    // Check if manually opened (status = 'in_progress' means admin opened it)
    if (session.status !== "in_progress") {
      return {
        error: `Check-in is not open yet. It will be available on the day of class.`,
      }
    }
  }

  // Look up attendee by license_number + session_id
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, status, checked_in_at")
    .eq("session_id", data.session_id)
    .eq("license_number", data.license_number)
    .single()

  if (attendeeError || !attendee) {
    // Not registered — offer walk-in registration
    return {
      notRegistered: true,
      error: `License ${data.license_number} is not registered for this class.`,
    }
  }

  // Already checked in
  if (attendee.status === "checked_in" || attendee.status === "evaluated" || attendee.status === "certified") {
    return {
      alreadyCheckedIn: true,
      attendeeName: `${attendee.first_name} ${attendee.last_name}`,
    }
  }

  // Insert ce_check_ins record
  const { error: checkInError } = await admin.from("ce_check_ins").insert({
    session_id: data.session_id,
    attendee_id: attendee.id,
  })

  if (checkInError) {
    // Duplicate check-in (unique constraint)
    if (
      checkInError.code === "23505" ||
      checkInError.message?.includes("duplicate")
    ) {
      return {
        alreadyCheckedIn: true,
        attendeeName: `${attendee.first_name} ${attendee.last_name}`,
      }
    }
    console.error("Check-in insert failed:", checkInError)
    return { error: "Check-in failed. Please try again." }
  }

  // Update ce_attendees: status='checked_in', checked_in_at=now()
  await admin
    .from("ce_attendees")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", attendee.id)

  // Increment ce_sessions.checked_in_count
  try {
    await admin.rpc("increment_checked_in_count", {
      p_session_id: data.session_id,
    })
  } catch {
    // Fallback: manual increment
    try {
      const { data: currentSession } = await admin
        .from("ce_sessions")
        .select("checked_in_count")
        .eq("id", data.session_id)
        .single()
      if (currentSession) {
        await admin
          .from("ce_sessions")
          .update({
            checked_in_count: (currentSession.checked_in_count || 0) + 1,
          })
          .eq("id", data.session_id)
      }
    } catch (countErr) {
      console.error("Failed to increment checked_in_count:", countErr)
    }
  }

  redirect(
    `/form/checkin/${data.session_id}/success?name=${encodeURIComponent(attendee.first_name + " " + attendee.last_name)}`
  )
}
