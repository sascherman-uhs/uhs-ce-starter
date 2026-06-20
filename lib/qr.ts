import QRCode from "qrcode"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPublicAppUrl } from "@/lib/public-url"

export type QRCodeType = "registration" | "checkin" | "evaluation"

const QR_CODE_CONFIGS: Record<QRCodeType, { urlPath: string; filename: string }> = {
  registration: {
    urlPath: "form/register",
    filename: "registration.png",
  },
  checkin: {
    urlPath: "form/checkin",
    filename: "checkin.png",
  },
  evaluation: {
    urlPath: "form/eval",
    filename: "evaluation.png",
  },
}

/**
 * Generate a single QR code PNG buffer for a given session and type
 */
export async function generateQRCodeBuffer(
  sessionId: string,
  type: QRCodeType
): Promise<Buffer> {
  const config = QR_CODE_CONFIGS[type]
  // Resolve the PUBLIC app URL at CALL time (never at module load) — this is the
  // whole point of getPublicAppUrl()'s call-time-throw design: a QR PNG must
  // encode the production origin, never localhost (Jun 10 2026 incident).
  const url = `${getPublicAppUrl()}/${config.urlPath}/${sessionId}`

  const buffer = await QRCode.toBuffer(url, {
    type: "png",
    width: 400,       // 400px = reliable scanning at 2"+ print (200 DPI)
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  })

  return buffer
}

/**
 * Generate all 3 QR codes for a session and upload to Supabase Storage.
 * Returns the public URLs for each QR code.
 */
export async function generateSessionQRCodes(
  sessionId: string
): Promise<Record<QRCodeType, string>> {
  const admin = createAdminClient()
  const results: Record<string, string> = {}

  for (const type of Object.keys(QR_CODE_CONFIGS) as QRCodeType[]) {
    const config = QR_CODE_CONFIGS[type]
    const storagePath = `qr/${sessionId}/${config.filename}`

    // Generate the QR code PNG
    const buffer = await generateQRCodeBuffer(sessionId, type)

    // Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("ce-assets")
      .upload(storagePath, buffer, {
        contentType: "image/png",
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Failed to upload ${type} QR code: ${uploadError.message}`)
    }

    // Get the public URL
    const { data: urlData } = admin.storage
      .from("ce-assets")
      .getPublicUrl(storagePath)

    results[type] = urlData.publicUrl
  }

  return results as Record<QRCodeType, string>
}

/**
 * Update a specific cascade step's status on a session.
 * Reads current cascade_status, merges the update, writes back.
 */
export async function updateCascadeStatus(
  sessionId: string,
  step: "qr_codes" | "flyer" | "email" | "calendar" | "division_notice",
  update: Record<string, any>
): Promise<void> {
  const admin = createAdminClient()

  // Read current status
  const { data: session, error: readError } = await admin
    .from("ce_sessions")
    .select("cascade_status")
    .eq("id", sessionId)
    .single()

  if (readError || !session) {
    throw new Error(`Failed to read session: ${readError?.message}`)
  }

  // Merge
  const currentStatus = (session.cascade_status as Record<string, any>) || {}
  const updatedStatus = {
    ...currentStatus,
    [step]: { ...currentStatus[step], ...update },
  }

  // Write back
  const { error: writeError } = await admin
    .from("ce_sessions")
    .update({ cascade_status: updatedStatus })
    .eq("id", sessionId)

  if (writeError) {
    throw new Error(`Failed to update cascade status: ${writeError.message}`)
  }
}
