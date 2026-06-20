/**
 * Shared Nevada real-estate license utilities.
 *
 * Single source of truth for license-number normalization + validation,
 * imported by both the public registration Server Action
 * (app/form/register/actions.ts) and the admin add/edit attendee actions
 * (app/admin/sessions/actions.ts). Extracted rather than duplicated so the
 * two surfaces can never drift apart.
 *
 * This is a PURE string utility: no "use server", no node: imports, no
 * Supabase imports. Safe to import from Server Actions, Server Components,
 * and client components alike.
 */

/**
 * Normalize a Nevada real estate license number:
 * - Uppercase the prefix
 * - Strip leading zeros after the prefix dot
 * - Strip trailing text (Corp, LLC, Inc, Jr., Sr., II, III, etc.)
 * - Ensure period between prefix and number
 *
 * Valid prefixes: S (Salesperson), BS (Broker Salesperson),
 *   B (Broker), PM (Property Manager), PB (Property Mgr Broker)
 */
export function normalizeLicenseNumber(raw: string): string {
  let s = raw.trim().toUpperCase()

  // Strip trailing text after digits (Corp, LLC, Inc, Jr., Sr., II, III, etc.)
  s = s.replace(/(\d)\s*(CORP|LLC|INC|JR\.?|SR\.?|II|III|IV).*$/i, "$1")

  // Ensure period after prefix if missing (e.g., "S1234" → "S.1234")
  s = s.replace(/^(BS|PB|PM|S|B)(?!\.)(\d)/, "$1.$2")

  // Strip leading zeros after the dot: S.0123 → S.123
  s = s.replace(/\.(0+)(\d)/, ".$2")

  return s
}

/**
 * Canonical Nevada license format: prefix + dot + number with no leading zeros.
 * e.g. S.1234567, BS.123456, B.12345, PM.1234
 */
export const LICENSE_NUMBER_REGEX = /^(S|BS|B|PM|PB)\.[1-9]\d{0,6}$/

export const LICENSE_NUMBER_ERROR =
  "Invalid format. Use prefix + number with no leading zeros (e.g., S.1234567, BS.123456, B.12345, PM.1234)"
