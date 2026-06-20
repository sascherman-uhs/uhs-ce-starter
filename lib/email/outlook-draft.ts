/**
 * Outlook / Microsoft Graph draft creation — STUBBED in this starter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The reference app created review-before-send drafts in a Microsoft 365
 * mailbox via the Graph API (MSAL token cache). That is highly environment-
 * specific (Azure app registration + a local token cache) and is NOT part of a
 * generic open-source starter, so it is STUBBED here: the function logs the
 * intent and returns a fake draft id.
 *
 * TO WIRE YOUR OWN OUTLOOK/GRAPH DRAFTS:
 *   1. Register an Azure AD app, grant Mail.ReadWrite, and obtain a token.
 *   2. Put the client id / tenant id / token source in environment variables
 *      (e.g. AZURE_CLIENT_ID, AZURE_TENANT_ID) — never hardcode them.
 *   3. Replace the stub body with a Graph `POST /me/messages` call.
 *
 * Or simply route these drafts through the same provider you wire for
 * lib/email/gmail.ts. See README.md → "Wiring email".
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface OutlookDraftParams {
  to: string
  subject: string
  body: string
  bodyType?: "text" | "html"
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

/**
 * STUB — would create a draft email in a Microsoft 365 mailbox via Graph.
 * Logs the intent and returns a fake draft id. Wire your own integration.
 */
export async function draftViaOutlook(params: OutlookDraftParams): Promise<{
  success: boolean
  draftId?: string
  error?: string
}> {
  console.log(
    `[STUB draftViaOutlook] would create a draft "${params.subject}" to ${params.to} ` +
      `(${params.attachments?.length ?? 0} attachment(s)). ` +
      `Wire Microsoft Graph in lib/email/outlook-draft.ts — see README.`
  )
  return { success: true, draftId: "stub-draft-id" }
}
