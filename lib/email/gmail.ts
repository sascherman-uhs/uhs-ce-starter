/**
 * Gmail / SMTP email module — STUBBED in this starter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The reference app used nodemailer (SMTP send) + imapflow (IMAP draft) with a
 * Gmail App Password. This open-source wireframe ships those calls STUBBED: the
 * functions below log what they WOULD send and return success, so the rest of
 * the app keeps working without any mail credentials.
 *
 * TO WIRE YOUR OWN SMTP/GMAIL SENDING:
 *   1. Restore the nodemailer + imapflow implementation (both deps are already
 *      in package.json), OR swap in your provider of choice.
 *   2. Add GMAIL_USER + GMAIL_APP_PASSWORD (or your SMTP creds) to .env.
 *   3. Replace the stub bodies below.
 *
 * See README.md → "Wiring email".
 * ───────────────────────────────────────────────────────────────────────────
 */

import { BRANDING } from "@/lib/config/branding"

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  replyTo?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
}

/**
 * STUB — would send an email immediately via SMTP.
 * Logs the intent and returns a fake success. Wire your own provider.
 */
export async function sendViaGmail(params: SendEmailParams): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  console.log(
    `[STUB sendViaGmail] would send "${params.subject}" to ${params.to} ` +
      `(replyTo: ${params.replyTo || BRANDING.replyToEmail}). ` +
      `Wire SMTP in lib/email/gmail.ts — see README.`
  )
  return { success: true, messageId: "stub-message-id" }
}

/**
 * STUB — would append an email to the Drafts folder via IMAP.
 * Logs the intent and returns a fake success. Wire your own provider.
 */
export async function draftViaGmail(params: SendEmailParams): Promise<{
  success: boolean
  error?: string
}> {
  console.log(
    `[STUB draftViaGmail] would draft "${params.subject}" to ${params.to}. ` +
      `Wire IMAP in lib/email/gmail.ts — see README.`
  )
  return { success: true }
}
