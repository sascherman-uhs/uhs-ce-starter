"use client"

import { useEffect, useRef } from "react"

/**
 * Auto-fires the browser print dialog once on mount, and offers a visible
 * Print button + Back link (both hidden in the actual print output via the
 * Tailwind `print:hidden` variant). A ref-guard prevents the double-fire that
 * React StrictMode's double-invoked effects would otherwise cause in dev.
 */
export function PrintControls({ sessionId }: { sessionId: string }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    // Defer one tick so the sheet has painted before the dialog opens.
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="print:hidden mb-4 flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        Print
      </button>
      <a
        href={`/admin/sessions/${sessionId}`}
        className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        Back to session
      </a>
    </div>
  )
}
