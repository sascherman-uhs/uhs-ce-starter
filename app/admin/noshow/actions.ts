"use server"

import { createClient } from "@/lib/supabase/server"
import { optOutAttendee, optInAttendee } from "@/lib/noshow/opt-out"
import { recordFlodeskSync } from "@/lib/noshow/flodesk"
import { getGlobalNoShows } from "@/lib/noshow/identify"
import { revalidatePath } from "next/cache"

export type OptOutState = {
  success?: boolean
  error?: string
}

export async function optOutAction(
  _prevState: OptOutState,
  formData: FormData
): Promise<OptOutState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const email = formData.get("email") as string
  if (!email) return { error: "Missing email" }

  const result = await optOutAttendee(email)

  if (!result.success) {
    return { error: result.error || "Failed to opt out" }
  }

  revalidatePath("/admin/noshow")
  return { success: true }
}

export async function optInAction(
  _prevState: OptOutState,
  formData: FormData
): Promise<OptOutState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const email = formData.get("email") as string
  if (!email) return { error: "Missing email" }

  const result = await optInAttendee(email)

  if (!result.success) {
    return { error: result.error || "Failed to opt in" }
  }

  revalidatePath("/admin/noshow")
  return { success: true }
}

export type SyncFlodeskState = {
  success?: boolean
  syncId?: string
  error?: string
}

export async function syncToFlodeskAction(
  _prevState: SyncFlodeskState,
  formData: FormData
): Promise<SyncFlodeskState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // "global" sync — record intent for the background worker to execute
  const noShows = await getGlobalNoShows()

  if (noShows.length === 0) {
    return { error: "No eligible no-shows to sync" }
  }

  const targetSessionId = formData.get("target_session_id") as string | null

  const result = await recordFlodeskSync("global", {
    targetSessionId: targetSessionId || undefined,
    syncedBy: user.email || "admin",
    attendeeCount: noShows.length,
  })

  if (!result.success) {
    return { error: result.error || "Failed to record sync" }
  }

  revalidatePath("/admin/noshow")
  return { success: true, syncId: result.syncId }
}
