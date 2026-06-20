/**
 * Single source of truth for the PUBLIC app URL baked into DURABLE OUTWARD
 * ARTIFACTS — QR PNGs, the branded flyer, coordinator/division email bodies,
 * calendar events, filing attachments. Anything that leaves the system and is
 * scanned/clicked by a human on another device.
 *
 * -- artifact-URL vs runtime-URL ----------------------------------------------
 * This is NOT for runtime/ephemeral URLs. Stripe success/cancel return URLs,
 * in-app redirect() targets, the admin Quick-Links dashboard panel, and the
 * /api/payments/status poll endpoint correctly use NEXT_PUBLIC_APP_URL (which is
 * localhost in dev — and that is RIGHT for an in-session redirect on the same
 * machine). A durable artifact, by contrast, is opened later on a phone that has
 * no idea what "localhost" means.
 *
 * -- why this exists (Jun 10 2026 incident) -----------------------------------
 * lib/qr.ts used `NEXT_PUBLIC_APP_URL || "http://localhost:3001"`. The June 10
 * class QR codes were generated from the localhost dev server, so the PNGs
 * encoded http://localhost:3001/... — unscannable from any attendee phone. A
 * manual regen against production was required day-of. User directive: "I can
 * not and do not ever want a baked qr with a local host."
 *
 * -- why a function (call-time throw) and not a const (import-time throw) ------
 * A module-level const that threw at import would crash unrelated routes that
 * merely import a module in this file's dependency graph (e.g. lib/qr.ts ->
 * updateCascadeStatus is imported broadly). A function that throws only when an
 * artifact is actually being generated keeps the blast radius at the artifact
 * boundary — exactly where a loud failure is desirable (a failed flyer/QR job
 * with a clear error beats a silently-localhost-baked PNG). This was the
 * planner's named call and is the chosen design.
 */

const PRODUCTION_FALLBACK = "https://ce.example.com"
const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1|0\.0\.0\.0/i

export function getPublicAppUrl(): string {
  const resolved = (process.env.CE_PUBLIC_APP_URL || PRODUCTION_FALLBACK).trim()

  if (LOCALHOST_PATTERN.test(resolved)) {
    throw new Error(
      `PUBLIC_APP_URL must never be localhost — durable artifacts (QR/flyer/email) ` +
        `would be unscannable. Resolved to "${resolved}" (from ` +
        `${process.env.CE_PUBLIC_APP_URL ? "CE_PUBLIC_APP_URL" : "fallback"}). ` +
        `Set CE_PUBLIC_APP_URL to the production app origin (e.g. ${PRODUCTION_FALLBACK}).`
    )
  }

  // Strip a single trailing slash so callers can safely template `${url}/path`.
  return resolved.replace(/\/$/, "")
}
