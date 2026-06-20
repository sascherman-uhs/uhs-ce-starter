/**
 * Flyer Generation Cascade Step — STUBBED in this starter (makes NO external call).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The reference app generated the session flyer by spawning a Python script
 * (`scripts/generate-flyer.py`) that overlaid session details onto a branded
 * Canva-exported template. That script and template are NOT part of this
 * open-source starter, so this cascade step is stubbed to a no-op.
 *
 * This starter ships an in-process flyer generator instead — see
 * `lib/flyer/generate.ts` (`generateAndUploadFlyer` / `generateFlyerPdf`), which
 * builds the flyer PDF with `@react-pdf/renderer` and uploads it to Supabase
 * Storage. Wire that (or your own design tool) into the admin flyer action.
 *
 * TODO: customize for your school — generate your branded flyer here, or call
 * `generateAndUploadFlyer(...)` from `lib/flyer/generate.ts`.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * STUB — would generate and upload the session flyer and return its public URL.
 * Returns an empty string (no flyer) so the cascade continues without crashing.
 */
export async function generateSessionFlyer(sessionId: string): Promise<string> {
  console.log(
    `[STUB generateSessionFlyer] session=${sessionId} — flyer generation is not ` +
      `wired in this starter. See lib/cascade/flyer.ts and lib/flyer/generate.ts.`
  )
  return ""
}
