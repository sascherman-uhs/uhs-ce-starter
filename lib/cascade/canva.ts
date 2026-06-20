/**
 * Canva Flyer Generation -- MCP Workflow Reference
 *
 * This module documents the Canva MCP steps the background worker executes.
 * These functions are NOT callable from Next.js -- they require
 * Claude Code MCP tools at runtime.
 *
 * the background worker Workflow:
 * 1. mcp__canva__get-design-content({ designId: "YOUR-CANVA-TEMPLATE-ID" })
 *    -- Inspect template to get text element IDs
 *
 * 2. mcp__canva__create-design-from-candidate({...})
 *    -- Duplicate template for this session
 *
 * 3. Update text elements with session details:
 *    - Date: formatted session date
 *    - Time: formatted start - end time
 *    - Location: brokerage name + address
 *
 * 4. mcp__canva__upload-asset-from-url({
 *      url: registration QR code public URL
 *    })
 *    -- Upload registration QR as asset to embed in flyer
 *
 * 5. mcp__canva__export-design({
 *      designId: newDesignId,
 *      format: "pdf"  // and "png"
 *    })
 *    -- Export both PDF and PNG versions
 *
 * 6. Download exports and upload to Supabase Storage:
 *    - flyers/{session_id}/flyer.pdf
 *    - flyers/{session_id}/flyer.png
 *
 * 7. Update ce_sessions:
 *    - flyer_url = public URL of PNG
 *    - cascade_status.flyer.completed_at = now
 *    - cascade_status.flyer.canva_design_id = newDesignId
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { updateCascadeStatus } from "@/lib/qr"

/**
 * Update session with flyer artifacts after the background worker completes Canva MCP steps.
 * Called by the background worker after generating the flyer.
 */
export async function recordFlyerCompletion(
  sessionId: string,
  flyerPngUrl: string,
  canvaDesignId: string
): Promise<void> {
  const admin = createAdminClient()

  // Update the session's flyer_url
  const { error } = await admin
    .from("ce_sessions")
    .update({ flyer_url: flyerPngUrl })
    .eq("id", sessionId)

  if (error) {
    throw new Error(`Failed to update flyer_url: ${error.message}`)
  }

  // Update cascade status
  await updateCascadeStatus(sessionId, "flyer", {
    completed_at: new Date().toISOString(),
    canva_design_id: canvaDesignId,
  })
}
