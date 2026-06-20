import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeLicenseNumber } from "@/lib/registration/license"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/eval/gate-check?sessionId=xxx&license=xxx
 *
 * Checks if an attendee is checked in for a session.
 * Used by the client-side gate check component before showing the eval form.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  const license = normalizeLicenseNumber(searchParams.get("license") ?? "")

  if (!sessionId || !license) {
    return NextResponse.json(
      { error: "Missing sessionId or license" },
      { status: 400 }
    )
  }

  // Validate license format
  if (!/^(S|BS|B|PM|PB)\.\d{1,7}$/.test(license)) {
    return NextResponse.json(
      { error: "Invalid license format", status: "invalid" },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Look up attendee
  const { data: attendee, error } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, status")
    .eq("session_id", sessionId)
    .eq("license_number", license)
    .single()

  if (error || !attendee) {
    return NextResponse.json({ status: "not_found" })
  }

  return NextResponse.json({
    status: attendee.status,
    name: `${attendee.first_name} ${attendee.last_name}`,
  })
}
