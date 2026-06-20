"use client"

import { useState } from "react"
import { notifyDivisionAction } from "../filing-actions"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatDraftedAt(isoString: string): string {
  const d = new Date(isoString)
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  const h = hours % 12 || 12
  const mm = String(minutes).padStart(2, "0")
  return `${month} ${day} at ${h}:${mm} ${ampm}`
}

export function DivisionNoticeSection({
  session,
  sessionId,
}: {
  session: any
  sessionId: string
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null)

  const draftedAt = (session.cascade_status as any)?.division_notice?.drafted_at as string | undefined
  const attachedFilename = (session.cascade_status as any)?.division_notice
    ?.attached_form_filename as string | undefined

  async function handleClick() {
    setLoading(true)
    setResult(null)
    const r = await notifyDivisionAction(sessionId)
    setResult(r)
    setLoading(false)
  }

  return (
    <div className="rounded-md border p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Division Schedule Notice</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            NRED-required pre-class notification to schedule-filing@your-state.gov (Form 901 attached)
          </p>
        </div>
        {draftedAt ? (
          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
            Draft Created
          </span>
        ) : (
          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
            Not Drafted
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleClick}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading
            ? "Creating Draft..."
            : draftedAt
            ? "Redraft Division Notice"
            : "Draft Division Schedule Notice"}
        </button>

        {draftedAt && (
          <span className="text-xs text-muted-foreground self-center">
            Last drafted {formatDraftedAt(draftedAt)}
          </span>
        )}

        {attachedFilename && (
          <span className="text-xs text-muted-foreground self-center">
            · Attached: <span className="font-mono">{attachedFilename}</span>
          </span>
        )}

        {result?.success && (
          <span className="text-xs text-green-600 self-center">
            Draft Created — Review in Outlook
          </span>
        )}
      </div>

      {result?.error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {result.error}
        </div>
      )}
    </div>
  )
}
