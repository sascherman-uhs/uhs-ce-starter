/**
 * displayPhone — THE human-facing phone formatter for this repo.
 *
 * Rule (Scott, 2026-09-11, global): a phone is formatted wherever a human reads
 * it (tables, cards, inputs, emails, SMS, PDFs). Storage / Twilio stay E.164.
 * NANP (10 digits, or 11 with a leading 1) → "(702) 555-0100"; extensions are
 * kept; any other shape is returned verbatim so an international or partial
 * number is never mangled into a plausible-looking wrong US number.
 */
export function displayPhone(raw: string | null | undefined): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const m = s.match(/^(.*?)(\s*(?:x|ext\.?|extension|#)\s*\d+)\s*$/i)
  const core = m ? m[1] : s
  const ext = m ? ` ${m[2].trim()}` : ''
  let d = core.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return s
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}${ext}`
}
