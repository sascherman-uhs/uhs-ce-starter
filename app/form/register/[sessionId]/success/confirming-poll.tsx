"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Client island for the "Confirming your registration…" state of the
 * success page (Phase 8 / Plan 05).
 *
 * Per UI-SPEC §"Component Inventory" and RESEARCH.md §"Success page UX":
 *   - Polls /api/payments/status?cs=<id> every 2 seconds.
 *   - After 20 seconds with no `ready: true`, switches to the
 *     stuck-after-20s helper copy.
 *   - On `ready: true`, calls router.refresh() so the parent Server
 *     Component re-runs its DB lookup and re-renders as the success view.
 *
 * The parent <meta http-equiv="refresh" content="2"> handles the no-JS
 * fallback (REG-05 progressive enhancement); this island just makes the
 * JS path snappier (no full page reload while the webhook lands).
 *
 * Props are intentionally minimal — the page already renders the spinner
 * shell + "Confirming your registration…" heading; this component only
 * adds the post-20s helper paragraph and runs the poll loop.
 */
export function ConfirmingPoll({
  checkoutSessionId,
}: {
  checkoutSessionId: string
}) {
  const router = useRouter()
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    let cancelled = false
    const start = Date.now()
    const MAX_MS = 20_000
    const INTERVAL_MS = 2_000

    async function tick() {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/payments/status?cs=${encodeURIComponent(checkoutSessionId)}`,
          { cache: "no-store" }
        )
        if (res.ok) {
          const json = (await res.json()) as { ready?: boolean }
          if (json.ready) {
            router.refresh()
            return
          }
        }
      } catch {
        // network blip — keep polling, eventual stuck-helper covers persistent failure
      }
      if (Date.now() - start >= MAX_MS) {
        if (!cancelled) setStuck(true)
        return
      }
      setTimeout(tick, INTERVAL_MS)
    }

    setTimeout(tick, INTERVAL_MS)
    return () => {
      cancelled = true
    }
  }, [checkoutSessionId, router])

  if (!stuck) return null

  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      Still waiting? Your payment may have gone through. Check your email or
      contact us at hello@example.com.
    </p>
  )
}
