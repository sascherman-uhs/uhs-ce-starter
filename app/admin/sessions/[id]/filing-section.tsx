"use client"

import { useState, useEffect } from "react"
import {
  generate785aRosterAction,
  generate612cSummaryAction,
  markFiled785a,
  markFiled612c,
  email785aToDiv,
  email612cToDiv,
} from "../filing-actions"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatFiledDate(isoString: string): string {
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

type ValidationIssue = {
  attendeeId?: string
  attendeeName?: string
  licenseNumber?: string
  field?: string
  issue: string
  severity: "error" | "warning"
}

type FilingStatus = "not_filed" | "draft_ready" | "filed"

function getFilingStatus(session: any): {
  roster: FilingStatus
  eval: FilingStatus
  overall: FilingStatus
} {
  const rosterStatus: FilingStatus = session.filed_785a_at
    ? "filed"
    : session.roster_generated_at
    ? "draft_ready"
    : "not_filed"

  const evalStatus: FilingStatus = session.filed_612c_at
    ? "filed"
    : session.eval_summary_generated_at
    ? "draft_ready"
    : "not_filed"

  const overall: FilingStatus =
    rosterStatus === "filed" && evalStatus === "filed"
      ? "filed"
      : rosterStatus !== "not_filed" || evalStatus !== "not_filed"
      ? "draft_ready"
      : "not_filed"

  return { roster: rosterStatus, eval: evalStatus, overall: overall }
}

function StatusBadge({ status }: { status: FilingStatus }) {
  const colors = {
    not_filed: "bg-red-100 text-red-700",
    draft_ready: "bg-yellow-100 text-yellow-700",
    filed: "bg-green-100 text-green-700",
  }
  const labels = {
    not_filed: "Not Filed",
    draft_ready: "Draft Ready",
    filed: "Filed",
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {labels[status]}
    </span>
  )
}

function DeadlineCountdown({
  filingDeadline,
}: {
  filingDeadline: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const deadline = new Date(filingDeadline + "T23:59:59")
  const now = new Date()
  const diffMs = deadline.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (!mounted) return <span className="text-sm text-muted-foreground">Loading...</span>

  let color = "text-muted-foreground"
  let text = ""

  if (diffDays < 0) {
    color = "text-red-600 font-bold"
    text = `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""} OVERDUE`
  } else if (diffDays === 0) {
    color = "text-red-600 font-bold"
    text = "DUE TODAY"
  } else if (diffDays === 1) {
    color = "text-amber-600 font-semibold"
    text = "Due tomorrow"
  } else if (diffDays <= 3) {
    color = "text-amber-600"
    text = `${diffDays} days remaining`
  } else {
    text = `${diffDays} days remaining`
  }

  return <span className={`text-sm ${color}`}>{text}</span>
}

export function FilingSection({
  session,
  sessionId,
  computedDeadline,
}: {
  session: any
  sessionId: string
  computedDeadline?: string
}) {
  const [rosterLoading, setRosterLoading] = useState(false)
  const [evalLoading, setEvalLoading] = useState(false)
  const [markRosterLoading, setMarkRosterLoading] = useState(false)
  const [markEvalLoading, setMarkEvalLoading] = useState(false)
  const [rosterResult, setRosterResult] = useState<{
    downloadUrl?: string
    filename?: string
    rowCount?: number
    validationIssues?: ValidationIssue[]
    error?: string
  } | null>(null)
  const [evalResult, setEvalResult] = useState<{
    downloadUrl?: string
    filename?: string
    validationIssues?: ValidationIssue[]
    error?: string
  } | null>(null)
  const [markError, setMarkError] = useState<string | null>(null)
  const [emailRosterLoading, setEmailRosterLoading] = useState(false)
  const [emailEvalLoading, setEmailEvalLoading] = useState(false)
  const [emailRosterSent, setEmailRosterSent] = useState(false)
  const [emailEvalSent, setEmailEvalSent] = useState(false)

  const filingStatus = getFilingStatus(session)
  const effectiveDeadline = session.filing_deadline || computedDeadline

  async function handleGenerateRoster() {
    setRosterLoading(true)
    setRosterResult(null)
    try {
      const result = await generate785aRosterAction(sessionId)
      if (result.success) {
        setRosterResult({
          downloadUrl: result.downloadUrl,
          filename: result.filename,
          rowCount: result.rowCount,
          validationIssues: result.validationIssues,
        })
      } else {
        setRosterResult({
          error: result.error,
          validationIssues: result.validationIssues,
        })
      }
    } catch (err: any) {
      setRosterResult({ error: err.message })
    }
    setRosterLoading(false)
  }

  async function handleGenerateEval() {
    setEvalLoading(true)
    setEvalResult(null)
    try {
      const result = await generate612cSummaryAction(sessionId)
      if (result.success) {
        setEvalResult({
          downloadUrl: result.downloadUrl,
          filename: result.filename,
          validationIssues: result.validationIssues,
        })
      } else {
        setEvalResult({
          error: result.error,
          validationIssues: result.validationIssues,
        })
      }
    } catch (err: any) {
      setEvalResult({ error: err.message })
    }
    setEvalLoading(false)
  }

  async function handleMarkRosterFiled() {
    setMarkRosterLoading(true)
    setMarkError(null)
    const result = await markFiled785a(sessionId)
    if (!result.success) {
      setMarkError(result.error || "Failed to mark as filed")
    }
    setMarkRosterLoading(false)
  }

  async function handleMarkEvalFiled() {
    setMarkEvalLoading(true)
    setMarkError(null)
    const result = await markFiled612c(sessionId)
    if (!result.success) {
      setMarkError(result.error || "Failed to mark as filed")
    }
    setMarkEvalLoading(false)
  }

  async function handleEmailRoster() {
    setEmailRosterLoading(true)
    setMarkError(null)
    const result = await email785aToDiv(sessionId)
    if (result.success) {
      setEmailRosterSent(true)
    } else {
      setMarkError(result.error || "Failed to email roster")
    }
    setEmailRosterLoading(false)
  }

  async function handleEmailEval() {
    setEmailEvalLoading(true)
    setMarkError(null)
    const result = await email612cToDiv(sessionId)
    if (result.success) {
      setEmailEvalSent(true)
    } else {
      setMarkError(result.error || "Failed to email eval summary")
    }
    setEmailEvalLoading(false)
  }

  const warnings = rosterResult?.validationIssues?.filter(
    (i) => i.severity === "warning"
  )
  const errors = rosterResult?.validationIssues?.filter(
    (i) => i.severity === "error"
  )

  return (
    <div className="rounded-md border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Division Filing</h2>
        <StatusBadge status={filingStatus.overall} />
      </div>

      {/* Deadline */}
      {effectiveDeadline && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Filing Deadline:{" "}
            <span className="text-foreground font-medium">
              {new Date(effectiveDeadline + "T00:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              )}
            </span>
          </span>
          {filingStatus.overall !== "filed" && (
            <DeadlineCountdown filingDeadline={effectiveDeadline} />
          )}
        </div>
      )}

      {markError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {markError}
        </div>
      )}

      {/* 785a Roster */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              Form 785a — Course Roster
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              .xlsx to roster-filing@your-state.gov
            </p>
          </div>
          <StatusBadge status={filingStatus.roster} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerateRoster}
            disabled={rosterLoading}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {rosterLoading ? "Generating..." : "Generate 785a Roster"}
          </button>

          {rosterResult?.downloadUrl && (
            <a
              href={rosterResult.downloadUrl}
              download={rosterResult.filename}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Download .xlsx
            </a>
          )}

          {rosterResult?.downloadUrl && filingStatus.roster !== "filed" && !emailRosterSent && (
            <button
              onClick={handleEmailRoster}
              disabled={emailRosterLoading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {emailRosterLoading ? "Creating Draft..." : "Draft to Outlook"}
            </button>
          )}

          {emailRosterSent && (
            <span className="text-xs text-green-600 self-center">Draft Created — Review in Outlook</span>
          )}

          {filingStatus.roster === "draft_ready" && (
            <button
              onClick={handleMarkRosterFiled}
              disabled={markRosterLoading}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {markRosterLoading ? "Saving..." : "Mark as Filed"}
            </button>
          )}

          {filingStatus.roster === "filed" && (
            <span className="text-xs text-green-600 self-center">
              Filed{" "}
              {formatFiledDate(session.filed_785a_at)}
            </span>
          )}
        </div>

        {/* Roster generation result */}
        {rosterResult?.rowCount !== undefined && (
          <p className="text-xs text-green-600">
            Roster generated with {rosterResult.rowCount} attendee
            {rosterResult.rowCount !== 1 ? "s" : ""}.
          </p>
        )}

        {rosterResult?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            {rosterResult.error}
          </div>
        )}

        {/* Validation issues */}
        {errors && errors.length > 0 && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 space-y-1">
            <p className="text-xs font-semibold text-red-700">
              {errors.length} Error{errors.length !== 1 ? "s" : ""} (rows
              skipped):
            </p>
            {errors.map((issue, idx) => (
              <p key={idx} className="text-xs text-red-600">
                {issue.attendeeName} ({issue.licenseNumber}): {issue.issue}
              </p>
            ))}
          </div>
        )}

        {warnings && warnings.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-1">
            <p className="text-xs font-semibold text-amber-700">
              {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}{" "}
              (auto-corrected):
            </p>
            {warnings.map((issue, idx) => (
              <p key={idx} className="text-xs text-amber-600">
                {issue.attendeeName}: {issue.issue}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 612C Evaluation Summary */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              Form 612C — Evaluation Summary
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              PDF to eval-filing@your-state.gov
            </p>
          </div>
          <StatusBadge status={filingStatus.eval} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerateEval}
            disabled={evalLoading}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {evalLoading ? "Generating..." : "Generate 612C Summary"}
          </button>

          {evalResult?.downloadUrl && (
            <>
              <a
                href={evalResult.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Preview PDF
              </a>
              <a
                href={evalResult.downloadUrl}
                download={evalResult.filename}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Download PDF
              </a>
            </>
          )}

          {evalResult?.downloadUrl && filingStatus.eval !== "filed" && !emailEvalSent && (
            <button
              onClick={handleEmailEval}
              disabled={emailEvalLoading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {emailEvalLoading ? "Creating Draft..." : "Draft to Outlook"}
            </button>
          )}

          {emailEvalSent && (
            <span className="text-xs text-green-600 self-center">Draft Created — Review in Outlook</span>
          )}

          {filingStatus.eval === "draft_ready" && (
            <button
              onClick={handleMarkEvalFiled}
              disabled={markEvalLoading}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {markEvalLoading ? "Saving..." : "Mark as Filed"}
            </button>
          )}

          {filingStatus.eval === "filed" && (
            <span className="text-xs text-green-600 self-center">
              Filed{" "}
              {formatFiledDate(session.filed_612c_at)}
            </span>
          )}
        </div>

        {evalResult?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            {evalResult.error}
          </div>
        )}

        {evalResult?.downloadUrl && !evalResult.error && (
          <p className="text-xs text-green-600">
            Evaluation summary generated successfully.
          </p>
        )}

        {evalResult?.validationIssues &&
          evalResult.validationIssues.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-1">
              <p className="text-xs font-semibold text-amber-700">
                Validation Warnings:
              </p>
              {evalResult.validationIssues.map((issue, idx) => (
                <p key={idx} className="text-xs text-amber-600">
                  {issue.issue}
                </p>
              ))}
            </div>
          )}
      </div>

      {/* Filing instructions */}
      {filingStatus.overall !== "filed" && (
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>
            <strong>Filing instructions:</strong> Generate documents, review for
            accuracy, then send via Outlook:
          </p>
          <p>
            1. 785a roster (.xlsx) to{" "}
            <span className="font-mono">roster-filing@your-state.gov</span>
          </p>
          <p>
            2. 612C eval summary (PDF) to{" "}
            <span className="font-mono">eval-filing@your-state.gov</span>
          </p>
          <p>
            3. Subject line: course number + course title (e.g., "CE.0000000-RE
            FROM LISTED TO SOLD: THE REALTORS&apos; GUIDE TO HOME STAGING")
          </p>
          <p>4. Mark each as filed after sending.</p>
        </div>
      )}
    </div>
  )
}
