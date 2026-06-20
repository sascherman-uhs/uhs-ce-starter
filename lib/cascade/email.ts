import { format, parse } from "date-fns"
import { createAdminClient } from "@/lib/supabase/admin"
import { updateCascadeStatus } from "@/lib/qr"
import { getPublicAppUrl } from "@/lib/public-url"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { sendViaGmail } from "@/lib/email/gmail"
import { draftViaOutlook } from "@/lib/email/outlook-draft"
import { generateForm901 } from "@/lib/filing/form-901"
import { BRANDING } from "@/lib/config/branding"

// Resend transactional email — STUBBED in this starter (makes NO live sends).
// TODO: wire your own email provider. To restore real Resend, import it
//   ( import { Resend } from "resend" ), construct
//   ( const resend = new Resend(process.env.RESEND_API_KEY) ), and set
//   RESEND_API_KEY + a verified sending domain. See README → "Wiring email".
const resend = {
  emails: {
    async send(params: { to?: unknown; subject?: unknown }): Promise<{
      data: { id: string } | null
      error: { message: string } | null
    }> {
      console.log(
        `[STUB resend.emails.send] would send "${String(params?.subject)}" ` +
          `to ${String(params?.to)} — email is not wired (see README → "Wiring email").`
      )
      return { data: { id: "stub-email-id" }, error: null }
    },
  },
}

// ============================================================
// EMAIL ROUTING
// ============================================================
// Coordinator emails (scheduling, day-of roster) → Outlook MCP
//   - Sent by the background worker as part of cascade (MCP-only)
//   - From: hello@example.com (personal, relationship email)
//
// Certificate emails (post-evaluation) → Resend
//   - Sent by app server-side (no background-worker dependency)
//   - From: ce@example.com (transactional, via Resend)
//
// Division filing emails (785a, 612C) → Outlook MCP
//   - Sent by the background worker (MCP-only)
//   - From: hello@example.com (professional, regulatory)
// ============================================================

type SessionEmailData = {
  sessionId: string
  courseTitle: string
  sessionDate: string
  startTime: string
  endTime: string
  locationName: string
  locationAddress: string | null
  coordinatorName: string
  coordinatorEmail: string
  registrationUrl: string
  flyerPngUrl: string | null
}

// ============================================================
// FAILURE ALERTING
// ============================================================

async function alertEmailFailure(context: {
  type: "coordinator" | "certificate" | "filing" | "registration" | "division_notice"
  sessionId: string
  recipientEmail: string
  error: string
}) {
  // STARTER: email-failure alerting is simplified to a console log + a write to
  // the session's cascade_status so the admin dashboard can surface it. The
  // reference app also pushed alerts to Telegram/Slack via an external ops
  // pipeline — wire your own notifier (email, Slack, PagerDuty, etc.) here.
  console.error(
    `[email failure] type=${context.type} session=${context.sessionId} ` +
      `recipient=${context.recipientEmail} error=${context.error}`
  )

  // Log to ce_sessions cascade_status for dashboard visibility.
  try {
    await updateCascadeStatus(context.sessionId, "email", {
      failed_at: new Date().toISOString(),
      error: context.error,
      type: context.type,
    })
  } catch {
    // Don't let alert failure cascade
  }
}

// ============================================================
// COORDINATOR EMAIL
// ============================================================
// Sends the coordinator notification email via Resend.
// Previously was Outlook MCP only, now also callable
// from the admin dashboard.

export async function sendCoordinatorEmail(params: SessionEmailData): Promise<{
  success: boolean
  error?: string
}> {
  const formattedDate = formatSessionDate(params.sessionDate)
  const formattedStart = formatSessionTime(params.startTime)
  const formattedEnd = formatSessionTime(params.endTime)

  // Durable: rosterUrl is rendered into the coordinator email body.
  const APP_URL = getPublicAppUrl()
  const rosterUrl = `${APP_URL}/roster/${params.sessionId}`

  const html = buildCoordinatorEmailHtml({
    coordinatorName: params.coordinatorName,
    courseTitle: params.courseTitle,
    formattedDate,
    formattedStart,
    formattedEnd,
    locationName: params.locationName,
    locationAddress: params.locationAddress,
    registrationUrl: params.registrationUrl,
    rosterUrl,
  })

  try {
    const { error } = await resend.emails.send({
      from: `${BRANDING.transactionalFromName} <${BRANDING.transactionalFromEmail}>`,
      to: params.coordinatorEmail,
      subject: `CE Class Scheduled: ${params.courseTitle} — ${formattedDate}`,
      html,
    })

    if (error) {
      await alertEmailFailure({
        type: "coordinator",
        sessionId: params.sessionId,
        recipientEmail: params.coordinatorEmail,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    await recordCoordinatorEmailSent(params.sessionId)
    return { success: true }
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error"
    await alertEmailFailure({
      type: "coordinator",
      sessionId: params.sessionId,
      recipientEmail: params.coordinatorEmail,
      error: errorMsg,
    })
    return { success: false, error: errorMsg }
  }
}

/**
 * Build the coordinator email HTML template.
 * Used by the background worker when creating Outlook MCP drafts.
 *
 * IMPORTANT: This returns full HTML with inline styles.
 * When passing to mcp__microsoft-mcp__create_email_draft,
 * you MUST set contentType: "html" (not "text"), otherwise
 * Outlook will display raw HTML tags instead of rendering.
 */
export function buildCoordinatorEmailHtml(params: {
  coordinatorName: string
  courseTitle: string
  formattedDate: string
  formattedStart: string
  formattedEnd: string
  locationName: string
  locationAddress: string | null
  registrationUrl: string
  rosterUrl: string
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0; color: #1a1a2e;">Acme Staging Co.</h1>
    <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Continuing Education</p>
  </div>

  <p>Hi ${params.coordinatorName},</p>

  <p>Your CE class has been confirmed! Here are the details:</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h2 style="font-size: 18px; margin: 0 0 12px; color: #1a1a2e;">${params.courseTitle}</h2>
    <table style="width: 100%; font-size: 14px;">
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666; width: 80px;">Date</td>
        <td style="padding: 4px 0; font-weight: 500;">${params.formattedDate}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666;">Time</td>
        <td style="padding: 4px 0; font-weight: 500;">${params.formattedStart} - ${params.formattedEnd}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666;">Location</td>
        <td style="padding: 4px 0; font-weight: 500;">
          ${params.locationName}${params.locationAddress ? `<br><span style="font-weight: 400; color: #666;">${params.locationAddress}</span>` : ""}
        </td>
      </tr>
    </table>
  </div>

  <p><strong>Registration Link for Your Agents:</strong></p>
  <p>
    <a href="${params.registrationUrl}" style="display: inline-block; background: #1a1a2e; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
      Register for Class
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">
    Or copy this link: <a href="${params.registrationUrl}" style="color: #1a1a2e;">${params.registrationUrl}</a>
  </p>

  <p><strong>Live Registration Roster:</strong></p>
  <p style="font-size: 13px;">
    Check who has registered at any time: <a href="${params.rosterUrl}" style="color: #1a1a2e;">View Registration Roster</a>
  </p>

  <p>I've attached the class flyer — please share it along with the registration link with your agents. Each attendee must register individually to receive their CE certificate.</p>

  <p>If you have any questions, just reply to this email.</p>

  <p>
    Thank you,<br>
    <strong>Your Name</strong><br>
    Acme Staging Co.<br>
    555-555-5555
  </p>

  <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #999;">
    Acme Staging CE Administration
  </div>
</body>
</html>
  `.trim()
}

/**
 * Record that the background worker sent the coordinator email via Outlook MCP.
 * Called by the background worker after successful mcp__microsoft-mcp__send_email.
 */
export async function recordCoordinatorEmailSent(
  sessionId: string,
  outlookMessageId?: string
): Promise<void> {
  await updateCascadeStatus(sessionId, "email", {
    completed_at: new Date().toISOString(),
    sent_via: "outlook",
    outlook_message_id: outlookMessageId || null,
  })
}

/**
 * Draft the coordinator scheduling email in Scott's Outlook for review before sending.
 * Mirrors the Division Notice pattern (draft-only, Scott reviews + sends manually).
 * Attaches the generated PDF flyer if a flyer_url is present on the session.
 */
export async function draftCoordinatorEmailViaOutlook(
  params: SessionEmailData
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const formattedDate = formatSessionDate(params.sessionDate)
  const formattedStart = formatSessionTime(params.startTime)
  const formattedEnd = formatSessionTime(params.endTime)

  // Durable: rosterUrl is rendered into the coordinator email draft body.
  const APP_URL = getPublicAppUrl()
  const rosterUrl = `${APP_URL}/roster/${params.sessionId}`

  const html = buildCoordinatorEmailHtml({
    coordinatorName: params.coordinatorName,
    courseTitle: params.courseTitle,
    formattedDate,
    formattedStart,
    formattedEnd,
    locationName: params.locationName,
    locationAddress: params.locationAddress,
    registrationUrl: params.registrationUrl,
    rosterUrl,
  })

  const subject = `CE Class Scheduled: ${params.courseTitle} — ${formattedDate}`

  // Best-effort: fetch the flyer PDF and attach it. If the fetch fails, we still
  // create the draft — the email body has the registration link, and Scott can
  // attach the flyer manually before sending.
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  if (params.flyerPngUrl) {
    try {
      const flyerResp = await fetch(params.flyerPngUrl)
      if (flyerResp.ok) {
        const buf = Buffer.from(await flyerResp.arrayBuffer())
        // Decode percent-encoded segments so recipients see "your org CE Class - Jul 15, 2026 - …"
        // instead of "your org%20CE%20Class%20-%20Jul%2015%2C%20…" when they download.
        const rawSlug = params.flyerPngUrl.split("/").pop() || "flyer.png"
        const filename = decodeURIComponent(rawSlug)
        const contentType = filename.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "image/png"
        attachments.push({ filename, content: buf, contentType })
      }
    } catch (err) {
      console.warn("Flyer fetch for Outlook draft failed (non-blocking):", err)
    }
  }

  try {
    const result = await draftViaOutlook({
      to: params.coordinatorEmail,
      subject,
      body: html,
      bodyType: "html",
      attachments,
    })

    if (!result.success) {
      await alertEmailFailure({
        type: "coordinator",
        sessionId: params.sessionId,
        recipientEmail: params.coordinatorEmail,
        error: result.error || "Outlook draft creation failed",
      })
      return { success: false, error: result.error }
    }

    const nowIso = new Date().toISOString()
    await updateCascadeStatus(params.sessionId, "email", {
      drafted_at: nowIso,
      completed_at: nowIso,
      sent_via: "outlook_draft",
      outlook_message_id: result.draftId || null,
    })

    return { success: true, draftId: result.draftId }
  } catch (err: any) {
    await alertEmailFailure({
      type: "coordinator",
      sessionId: params.sessionId,
      recipientEmail: params.coordinatorEmail,
      error: err.message || "Unknown error",
    })
    return { success: false, error: err.message }
  }
}

/**
 * Record coordinator email failure and trigger alerts.
 */
export async function recordCoordinatorEmailFailure(
  sessionId: string,
  coordinatorEmail: string,
  error: string
): Promise<void> {
  await alertEmailFailure({
    type: "coordinator",
    sessionId,
    recipientEmail: coordinatorEmail,
    error,
  })
}

// ============================================================
// CERTIFICATE EMAIL — Resend (app server-side, auto-send)
// ============================================================

/**
 * Send CE certificate to attendee.
 * Primary: Gmail SMTP (until Resend domain is verified)
 * Called server-side immediately after evaluation completion.
 * No the background worker dependency — fires from the app directly.
 */
export async function sendCertificateEmail(params: {
  sessionId: string
  attendeeEmail: string
  attendeeName: string
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string
  pdfUrl: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedDate = formatSessionDate(params.sessionDate)

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0; color: #1a1a2e;">Acme Staging Co.</h1>
    <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Continuing Education</p>
  </div>

  <p>Hi ${params.attendeeName},</p>

  <p>Thank you for completing the evaluation. Your certificate of attendance is attached.</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <table style="width: 100%; font-size: 14px;">
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Course</td><td style="font-weight: 500;">${params.courseTitle}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">CE #</td><td style="font-weight: 500;">${params.courseNumber}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Hours</td><td style="font-weight: 500;">${params.creditHours} General</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td style="font-weight: 500;">${formattedDate}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Sponsor</td><td style="font-weight: 500;">Acme Staging Co.</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Instructor</td><td style="font-weight: 500;">Your Name</td></tr>
    </table>
  </div>

  <p>Please retain this certificate for your records.</p>

  <p>
    Thank you,<br>
    <strong>Your Name</strong><br>
    Acme Staging Co.
  </p>
</body>
</html>
  `.trim()

  const filename = `CE_${params.courseNumber}_${params.attendeeName.replace(/\s+/g, "_")}_${params.sessionDate}.pdf`

  try {
    // Download the PDF from Supabase Storage to attach as buffer
    const pdfResponse = await fetch(params.pdfUrl)
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download certificate PDF: ${pdfResponse.status}`)
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())

    // Primary: Gmail SMTP
    const result = await sendViaGmail({
      to: params.attendeeEmail,
      subject: `Your CE Certificate: ${params.courseTitle}`,
      html,
      replyTo: "hello@example.com",
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    })

    if (!result.success) {
      await alertEmailFailure({
        type: "certificate",
        sessionId: params.sessionId,
        recipientEmail: params.attendeeEmail,
        error: result.error || "Gmail send failed",
      })
      return { success: false, error: result.error }
    }

    return { success: true, messageId: result.messageId }
  } catch (err: any) {
    await alertEmailFailure({
      type: "certificate",
      sessionId: params.sessionId,
      recipientEmail: params.attendeeEmail,
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

// ============================================================
// CERTIFICATE RESEND — Gmail SMTP (app server-side, admin-triggered)
// ============================================================

/**
 * Resend CE certificate to attendee via Gmail.
 * Reuses the same branded template as sendCertificateEmail but with
 * a "(Reissued)" subject line so the attendee knows it's a re-send.
 */
export async function resendCertificateEmail(params: {
  sessionId: string
  attendeeEmail: string
  attendeeName: string
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string
  pdfUrl: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedDate = formatSessionDate(params.sessionDate)
  const filename = `CE_${params.courseNumber}_${params.attendeeName.replace(/\s+/g, "_")}_${params.sessionDate}.pdf`

  try {
    const pdfResponse = await fetch(params.pdfUrl)
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download certificate PDF: ${pdfResponse.status}`)
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())

    const result = await sendViaGmail({
      to: params.attendeeEmail,
      subject: `Your CE Certificate (Reissued): ${params.courseTitle}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0; color: #1a1a2e;">Acme Staging Co.</h1>
    <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Continuing Education</p>
  </div>

  <p>Hi ${params.attendeeName},</p>

  <p>Here is your reissued certificate of attendance. Please see attached.</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <table style="width: 100%; font-size: 14px;">
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Course</td><td style="font-weight: 500;">${params.courseTitle}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">CE #</td><td style="font-weight: 500;">${params.courseNumber}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Hours</td><td style="font-weight: 500;">${params.creditHours} General</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td style="font-weight: 500;">${formattedDate}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Sponsor</td><td style="font-weight: 500;">Acme Staging Co.</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Instructor</td><td style="font-weight: 500;">Your Name</td></tr>
    </table>
  </div>

  <p>Please retain this certificate for your records.</p>

  <p>
    Thank you,<br>
    <strong>Your Name</strong><br>
    Acme Staging Co.
  </p>
</body>
</html>
      `.trim(),
      replyTo: "hello@example.com",
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    })

    if (!result.success) {
      await alertEmailFailure({
        type: "certificate",
        sessionId: params.sessionId,
        recipientEmail: params.attendeeEmail,
        error: result.error || "Gmail send failed",
      })
      return { success: false, error: result.error }
    }

    return { success: true, messageId: result.messageId }
  } catch (err: any) {
    await alertEmailFailure({
      type: "certificate",
      sessionId: params.sessionId,
      recipientEmail: params.attendeeEmail,
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

// ============================================================
// EVALUATION REMINDER — Gmail SMTP (app server-side, admin-triggered)
// ============================================================

/**
 * Email a checked-in attendee a branded reminder with a deep link straight
 * into their evaluation form, so they can complete the eval and receive their
 * CE certificate. Admin-triggered (per-row "Email Eval Link" button).
 *
 * Mirrors sendCertificateEmail for transport + branding + return shape, but:
 *   - carries a prominent "Complete Your Evaluation" deep-link button (+ raw
 *     fallback URL) instead of a PDF attachment, and
 *   - reuses the existing `type: "certificate"` alert channel (this is part of
 *     the cert flow — it nudges the attendee toward the cert) so the
 *     alertEmailFailure union does not have to widen.
 *
 * The `evalUrl` is built by the caller via getPublicAppUrl() (durable outward
 * artifact — must never be localhost), so this function takes it pre-formed.
 */
export async function sendEvalReminderEmail(params: {
  sessionId: string
  attendeeEmail: string
  attendeeName: string
  licenseNumber: string
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string
  evalUrl: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedDate = formatSessionDate(params.sessionDate)

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0; color: #1a1a2e;">Acme Staging Co.</h1>
    <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Continuing Education</p>
  </div>

  <p>Hi ${params.attendeeName},</p>

  <p>Thanks for attending the class — it was great having you there.</p>

  <p>There's just one step left: complete a short evaluation and your CE certificate will be on its way. Your certificate is emailed to you automatically within a few minutes after you submit.</p>

  <p>
    <a href="${params.evalUrl}" style="display: inline-block; background: #1a1a2e; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
      Complete Your Evaluation
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">
    Or copy this link: <a href="${params.evalUrl}" style="color: #1a1a2e;">${params.evalUrl}</a>
  </p>

  <p style="font-size: 13px; color: #666;">Your real estate license is already filled in for you by the link above.</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <table style="width: 100%; font-size: 14px;">
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Course</td><td style="font-weight: 500;">${params.courseTitle}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">CE #</td><td style="font-weight: 500;">${params.courseNumber}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Hours</td><td style="font-weight: 500;">${params.creditHours} General</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td style="font-weight: 500;">${formattedDate}</td></tr>
    </table>
  </div>

  <p>
    Thank you,<br>
    <strong>Your Name</strong><br>
    Acme Staging Co.
  </p>

  <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #999;">
    Questions? Contact <a href="mailto:hello@example.com" style="color: #999;">hello@example.com</a>
  </div>
</body>
</html>
  `.trim()

  const subject = `Action needed: complete your evaluation to receive your CE certificate`

  try {
    const result = await sendViaGmail({
      to: params.attendeeEmail,
      subject,
      html,
      replyTo: "hello@example.com",
    })

    if (!result.success) {
      await alertEmailFailure({
        type: "certificate",
        sessionId: params.sessionId,
        recipientEmail: params.attendeeEmail,
        error: result.error || "Gmail send failed",
      })
      return { success: false, error: result.error }
    }

    return { success: true, messageId: result.messageId }
  } catch (err: any) {
    await alertEmailFailure({
      type: "certificate",
      sessionId: params.sessionId,
      recipientEmail: params.attendeeEmail,
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

// ============================================================
// REGISTRATION CONFIRMATION — Resend (app server-side, auto-send)
// ============================================================

/**
 * Send registration confirmation to attendee via Resend.
 * Called server-side immediately after successful registration.
 * Non-blocking — caller should catch errors.
 */
export async function sendRegistrationConfirmation(params: {
  sessionId: string
  attendeeEmail: string
  attendeeName: string
  courseTitle: string
  sessionDate: string
  startTime: string
  endTime: string
  locationName: string
  locationAddress: string | null
}): Promise<{ success: boolean; resendId?: string; error?: string }> {
  const formattedDate = formatSessionDate(params.sessionDate)
  const formattedStart = formatSessionTime(params.startTime)
  const formattedEnd = formatSessionTime(params.endTime)

  try {
    const { data: result, error } = await resend.emails.send({
      from: `${BRANDING.transactionalFromName} <${BRANDING.transactionalFromEmail}>`,
      to: [params.attendeeEmail],
      replyTo: "hello@example.com",
      subject: `You're Registered: ${params.courseTitle} on ${formattedDate}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-size: 20px; margin: 0; color: #1a1a2e;">Acme Staging Co.</h1>
    <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Continuing Education</p>
  </div>

  <p>Hi ${params.attendeeName},</p>

  <p>You're registered for the following CE class:</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h2 style="font-size: 18px; margin: 0 0 12px; color: #1a1a2e;">${params.courseTitle}</h2>
    <table style="width: 100%; font-size: 14px;">
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666; width: 80px;">Date</td>
        <td style="padding: 4px 0; font-weight: 500;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666;">Time</td>
        <td style="padding: 4px 0; font-weight: 500;">${formattedStart} - ${formattedEnd}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #666;">Location</td>
        <td style="padding: 4px 0; font-weight: 500;">
          ${params.locationName}${params.locationAddress ? `<br><span style="font-weight: 400; color: #666;">${params.locationAddress}</span>` : ""}
        </td>
      </tr>
    </table>
  </div>

  <p><strong>What to expect:</strong></p>
  <ul style="font-size: 14px; padding-left: 20px;">
    <li>Check in when you arrive at class</li>
    <li>You must attend the full session to receive CE credit</li>
    <li>Your certificate will be emailed after completing the evaluation</li>
  </ul>

  <p>See you there!</p>

  <p>
    <strong>Your Name</strong><br>
    Acme Staging Co.
  </p>

  <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #999;">
    Acme Staging CE Administration
  </div>
</body>
</html>
      `.trim(),
    })

    if (error) {
      await alertEmailFailure({
        type: "registration",
        sessionId: params.sessionId,
        recipientEmail: params.attendeeEmail,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    return { success: true, resendId: result?.id }
  } catch (err: any) {
    await alertEmailFailure({
      type: "registration",
      sessionId: params.sessionId,
      recipientEmail: params.attendeeEmail,
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

// ============================================================
// DIVISION SCHEDULE NOTICE — Outlook draft (review-then-send)
// ============================================================
// NRED requires sponsors to notify the Division when a CE class is
// scheduled. Sends a course-offering email to schedule-filing@your-state.gov.
// Draft only — never auto-send. User reviews in Outlook before sending.

export type DivisionScheduleNoticeParams = {
  sessionId: string
  courseTitle: string
  courseNumber: string
  creditHours: string | number
  sessionDate: string  // "yyyy-MM-dd"
  startTime: string    // "HH:mm"
  endTime: string      // "HH:mm"
  locationName: string
  locationAddress: string | null
  coordinatorName: string
}

export async function draftDivisionScheduleNotice(
  params: DivisionScheduleNoticeParams
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const longDate = format(
    parse(params.sessionDate, "yyyy-MM-dd", new Date()),
    "EEEE, MMMM d, yyyy"
  )
  const subjectDate = formatSessionDate(params.sessionDate)
  const startFormatted = formatSessionTime(params.startTime)
  const endFormatted = formatSessionTime(params.endTime)

  const subject = `Course Offering Notification — ${params.courseNumber} — ${subjectDate} (${params.locationName})`

  // Brief cover note — the data lives in the attached Form 901.
  // (Keep the body short; the regulator wants the structured form, not a long
  // plain-text schedule block.)
  const locationLine = params.locationAddress
    ? `${params.locationName}, ${params.locationAddress}`
    : params.locationName
  const body = [
    `Dear Education Section,`,
    ``,
    `Please see the attached Form 901 for an upcoming offering of ${params.courseNumber}.`,
    ``,
    `  Course:   ${params.courseTitle}`,
    `  Date:     ${longDate}`,
    `  Time:     ${startFormatted} – ${endFormatted}`,
    `  Location: ${locationLine}`,
    ``,
    `Thank you,`,
    `Your Name`,
    `Acme Staging Co.`,
    `555-555-5555`,
  ].join("\n")

  try {
    // Generate the populated Form 901 attachment (NRED-required since May 1, 2026 rejection).
    const form901 = await generateForm901({
      sessionDate: params.sessionDate,
      startTime: params.startTime,
      courseTitle: params.courseTitle,
      courseNumber: params.courseNumber,
      creditHours: params.creditHours,
    })

    const result = await draftViaOutlook({
      to: "schedule-filing@your-state.gov",
      subject,
      body,
      attachments: [
        {
          filename: form901.filename,
          content: form901.buffer,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    })

    if (!result.success) {
      await alertEmailFailure({
        type: "division_notice",
        sessionId: params.sessionId,
        recipientEmail: "schedule-filing@your-state.gov",
        error: result.error || "Outlook draft creation failed",
      })
      return { success: false, error: result.error }
    }

    const nowIso = new Date().toISOString()
    await updateCascadeStatus(params.sessionId, "division_notice", {
      drafted_at: nowIso,
      completed_at: nowIso,  // mirrors other cascade steps for UI consistency
      draft_id: result.draftId || null,
      sent_via: "outlook",
      attached_form_filename: form901.filename,
    })

    return { success: true, draftId: result.draftId }
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error"
    await alertEmailFailure({
      type: "division_notice",
      sessionId: params.sessionId,
      recipientEmail: "schedule-filing@your-state.gov",
      error: errorMsg,
    })
    return { success: false, error: errorMsg }
  }
}
