/**
 * Branding & contact configuration — EDIT THIS for your business.
 *
 * This starter ships with generic placeholder values. Replace them with your
 * own company name, contact email, phone, and "from" addresses. These values
 * are rendered into emails, certificates, flyers, and regulatory filing bodies.
 *
 * Nothing here is a secret — these are public-facing identity strings. API keys
 * and credentials belong in environment variables (see .env.example), never here.
 */

// TODO: customize for your school — replace every value below with YOUR
// organization's identity (school name, contact info, signer, from-addresses).
export const BRANDING = {
  /** Company / organization name shown in emails, certificates, and the UI. */
  companyName: "Acme Staging Co.",

  /** Short label used in transactional "from" display names, e.g. "Acme CE". */
  shortName: "Acme CE",

  /** Public contact email attendees can reach for help / resends. */
  contactEmail: "hello@example.com",

  /** Contact phone shown on filings and email signatures. */
  contactPhone: "555-555-5555",

  /** Person/role who signs regulatory filing emails (roster, eval summary). */
  signerName: "Your Name",

  /**
   * "From" address for transactional email (certificates, confirmations).
   * Must be a domain you have verified with your email provider (e.g. Resend).
   */
  transactionalFromEmail: "ce@example.com",

  /** "From" display name for transactional email. */
  transactionalFromName: "Acme Staging CE",

  /** Reply-to used on outbound mail. */
  replyToEmail: "hello@example.com",
} as const

export type Branding = typeof BRANDING
