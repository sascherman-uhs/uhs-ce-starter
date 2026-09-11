"use client"

import { useState, useEffect, Fragment } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  manualCheckIn, type ManualCheckInState,
  resendCertificate, type ResendCertState,
  removeAttendee, type RemoveAttendeeState,
  updateAttendee, type UpdateAttendeeState,
  sendEvalReminderAction, type SendEmailState,
} from "../actions"
import { formatCents } from "@/lib/money"
import { RefundButton } from "./refund-button"
import { displayPhone } from "@/lib/phone"

type Attendee = {
  id: string
  first_name: string
  last_name: string
  license_number: string
  email: string
  phone: string | null
  status: string
  registered_at: string | null
  checked_in_at: string | null
  evaluated_at: string | null
  certified_at: string | null
  // Phase 8 additions (CONTEXT D-01, D-02, D-04, D-19):
  paid_amount_cents: number
  coupon_code: string | null
  stripe_payment_intent_id: string | null
  refunded_total_cents: number
}

type Evaluation = {
  attendee_id: string
  comments_not_acceptable: string | null
  additional_comments: string | null
}

// Phase 8 (D-18, D-19): refund row shape passed in alongside attendees.
type Refund = {
  attendee_id: string | null
  amount_cents: number
  created_at: string
  stripe_status: string
}

// Certificate row shape passed in alongside attendees — drives the inline
// "View Certificate" link (+ failed-delivery hint) in the Evaluated column.
type Certificate = {
  attendee_id: string
  pdf_url: string
  delivery_status: string
  delivered_at: string | null
}

type FilterMode = "all" | "no-shows"

/** Returns true if a comment string has meaningful content (not null, empty, or "N/A") */
function hasComment(comment: string | null): boolean {
  if (!comment) return false
  const trimmed = comment.trim().toLowerCase()
  return trimmed.length > 0 && trimmed !== "n/a" && trimmed !== "na" && trimmed !== "-"
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    registered: "bg-gray-100 text-gray-700",
    checked_in: "bg-green-100 text-green-700",
    evaluated: "bg-blue-100 text-blue-700",
    certified: "bg-purple-100 text-purple-700",
  }

  const labels: Record<string, string> = {
    registered: "Registered",
    checked_in: "Checked In",
    evaluated: "Evaluated",
    certified: "Certified",
  }

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}
    >
      {labels[status] || status}
    </span>
  )
}

/**
 * Phase 8 (UI-SPEC §"Page-Level Interaction Contracts / /admin/sessions/[id]"
 * + §"Color / Money / refund semantics"):
 *
 * Four sub-states (priority order):
 *   1. Refunded (amber)  — refunded_total_cents > 0 AND >= paid_amount_cents AND paid > 0
 *   2. Paid (green)      — paid_amount_cents > 0 (and not fully refunded)
 *   3. Comp (purple)     — coupon_code IS NOT NULL AND paid_amount_cents == 0
 *   4. Free (gray)       — paid_amount_cents == 0 AND coupon_code IS NULL
 *
 * Color tokens are reused verbatim from the existing badge palette in this file
 * + filing-section.tsx (no new semantic colors introduced).
 */
function PaymentBadge({
  attendee,
  refundDate,
}: {
  attendee: Attendee
  refundDate: string | null
}) {
  const isFullyRefunded =
    attendee.refunded_total_cents > 0 &&
    attendee.refunded_total_cents >= attendee.paid_amount_cents &&
    attendee.paid_amount_cents > 0

  if (isFullyRefunded && refundDate) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Refunded {formatCents(attendee.refunded_total_cents)} on {refundDate}
      </span>
    )
  }

  if (attendee.paid_amount_cents > 0) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Paid {formatCents(attendee.paid_amount_cents)}
      </span>
    )
  }

  if (attendee.coupon_code) {
    return (
      <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
        Comp
      </span>
    )
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
      Free
    </span>
  )
}

function CheckInSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-input px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {pending ? "..." : "Check In"}
    </button>
  )
}

function ManualCheckInButton({
  sessionId,
  attendeeId,
}: {
  sessionId: string
  attendeeId: string
}) {
  const [state, formAction] = useFormState<ManualCheckInState, FormData>(
    manualCheckIn,
    {}
  )

  if (state.success) {
    return (
      <span className="text-xs text-green-600 font-medium">Done</span>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="attendee_id" value={attendeeId} />
      <CheckInSubmitButton />
      {state.error && (
        <span className="text-xs text-destructive ml-1">{state.error}</span>
      )}
    </form>
  )
}

function EmailEvalLinkSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-input px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {pending ? "Sending…" : "Email Eval Link"}
    </button>
  )
}

function EmailEvalLinkButton({
  sessionId,
  attendeeId,
}: {
  sessionId: string
  attendeeId: string
}) {
  const [state, formAction] = useFormState<SendEmailState, FormData>(
    sendEvalReminderAction,
    {}
  )
  if (state.success) {
    return <span className="text-xs text-green-600 font-medium">Sent ✓</span>
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="attendee_id" value={attendeeId} />
      <EmailEvalLinkSubmitButton />
      {state.error && (
        <span className="text-xs text-destructive ml-1">{state.error}</span>
      )}
    </form>
  )
}

function ResendCertSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-purple-300 text-purple-700 px-2 py-1 text-xs font-medium hover:bg-purple-50 disabled:opacity-50"
    >
      {pending ? "Sending..." : label}
    </button>
  )
}

function ResendCertButton({
  sessionId,
  attendeeId,
  label,
}: {
  sessionId: string
  attendeeId: string
  label: "Resend Cert" | "Generate Cert"
}) {
  const [state, formAction] = useFormState<ResendCertState, FormData>(
    resendCertificate,
    {}
  )

  if (state.success) {
    return (
      <span className="text-xs text-green-600 font-medium">Sent</span>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="attendee_id" value={attendeeId} />
      <ResendCertSubmitButton label={label} />
      {state.error && (
        <span className="text-xs text-destructive ml-1">{state.error}</span>
      )}
    </form>
  )
}

function RemoveSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "..." : "Remove"}
    </button>
  )
}

function RemoveAttendeeButton({
  sessionId,
  attendeeId,
  attendeeName,
}: {
  sessionId: string
  attendeeId: string
  attendeeName: string
}) {
  const [state, formAction] = useFormState<RemoveAttendeeState, FormData>(
    removeAttendee,
    {}
  )
  const [confirming, setConfirming] = useState(false)

  if (state.success) {
    return <span className="text-xs text-red-500 font-medium">Removed</span>
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs font-medium hover:bg-red-50"
      >
        Remove
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <form action={formAction}>
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="attendee_id" value={attendeeId} />
        <RemoveSubmitButton />
      </form>
      <button
        onClick={() => setConfirming(false)}
        className="rounded border border-input px-2 py-1 text-xs font-medium hover:bg-accent"
      >
        Cancel
      </button>
      {state.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </div>
  )
}

/**
 * Per-row Edit affordance. Rendered UNCONDITIONALLY for every attendee
 * (typos get fixed before the 785a filing even after check-in). The actual
 * inline editor lives in a sibling <tr> (EditAttendeeRow) toggled via the
 * `editing` Set in AttendeeList — same pattern as the evaluation-comment
 * expansion already in this file.
 */
function EditAttendeeButton({
  editing,
  onToggle,
}: {
  editing: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="rounded border border-input px-2 py-1 text-xs font-medium hover:bg-accent"
    >
      {editing ? "Close" : "Edit"}
    </button>
  )
}

function EditSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  )
}

/**
 * Inline 5-field editor rendered as a full-width sibling <tr> beneath the
 * attendee's row. Inputs are UNCONTROLLED (defaultValue) so the server refresh
 * after a successful save supplies the corrected values via new props — no
 * client-side list mutation. Posts attendee_id + session_id to updateAttendee.
 * Edits ONLY identity/contact fields; never status, payment, or timestamps.
 */
function EditAttendeeRow({
  sessionId,
  attendee,
  onClose,
}: {
  sessionId: string
  attendee: Attendee
  onClose: () => void
}) {
  const [state, formAction] = useFormState<UpdateAttendeeState, FormData>(
    updateAttendee,
    {}
  )

  useEffect(() => {
    if (state.success) {
      onClose()
    }
    // onClose identity is stable enough here (parent toggler); key only on success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success])

  return (
    <tr className="border-b last:border-0 bg-muted/30">
      <td colSpan={8} className="px-4 py-3">
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="session_id" value={sessionId} />
          <input type="hidden" name="attendee_id" value={attendee.id} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">First name</label>
              <input
                name="first_name"
                defaultValue={attendee.first_name}
                className="w-full rounded border border-input px-2 py-1 text-sm"
              />
              {state.fieldErrors?.first_name && (
                <span className="text-xs text-destructive">
                  {state.fieldErrors.first_name[0]}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">Last name</label>
              <input
                name="last_name"
                defaultValue={attendee.last_name}
                className="w-full rounded border border-input px-2 py-1 text-sm"
              />
              {state.fieldErrors?.last_name && (
                <span className="text-xs text-destructive">
                  {state.fieldErrors.last_name[0]}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">License #</label>
              <input
                name="license_number"
                defaultValue={attendee.license_number}
                className="w-full rounded border border-input px-2 py-1 text-sm font-mono"
              />
              {state.fieldErrors?.license_number && (
                <span className="text-xs text-destructive">
                  {state.fieldErrors.license_number[0]}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={attendee.email}
                className="w-full rounded border border-input px-2 py-1 text-sm"
              />
              {state.fieldErrors?.email && (
                <span className="text-xs text-destructive">
                  {state.fieldErrors.email[0]}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">Phone</label>
              <input
                name="phone"
                defaultValue={displayPhone(attendee.phone)}
                className="w-full rounded border border-input px-2 py-1 text-sm"
              />
              {state.fieldErrors?.phone && (
                <span className="text-xs text-destructive">
                  {state.fieldErrors.phone[0]}
                </span>
              )}
            </div>
          </div>
          {state.error && (
            <span className="block text-xs text-destructive">{state.error}</span>
          )}
          <div className="flex items-center gap-2 pt-1">
            <EditSubmitButton />
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "-"
  const d = new Date(ts)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  })
}

export function AttendeeList({
  sessionId,
  attendees,
  refunds = [],
  sessionCompleted = false,
  evaluations = [],
  certificates = [],
}: {
  sessionId: string
  attendees: Attendee[]
  refunds?: Refund[]
  sessionCompleted?: boolean
  evaluations?: Evaluation[]
  certificates?: Certificate[]
}) {
  const [filter, setFilter] = useState<FilterMode>("all")
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())

  function toggleEditing(attendeeId: string) {
    setEditingRows((prev) => {
      const next = new Set(prev)
      if (next.has(attendeeId)) {
        next.delete(attendeeId)
      } else {
        next.add(attendeeId)
      }
      return next
    })
  }

  // Phase 8 (D-19): Build attendeeId → most-recent refund's M/D label for the
  // PaymentBadge. The refunds array is pre-sorted DESC by created_at upstream,
  // so the FIRST iteration per attendee is the most recent.
  const refundDateMap = new Map<string, string>()
  for (const r of refunds) {
    if (!r.attendee_id) continue
    if (refundDateMap.has(r.attendee_id)) continue
    const d = new Date(r.created_at)
    refundDateMap.set(
      r.attendee_id,
      d.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      })
    )
  }

  // Build attendeeId → certificate for the inline "View Certificate" link.
  const certMap = new Map<string, Certificate>()
  for (const c of certificates) {
    if (!c.attendee_id) continue
    certMap.set(c.attendee_id, c)
  }

  const noShowCount = attendees.filter((a) => a.status === "registered").length
  const filteredAttendees =
    filter === "no-shows"
      ? attendees.filter((a) => a.status === "registered")
      : attendees

  // Build evaluation lookup by attendee_id
  const evalMap = new Map<string, Evaluation>()
  for (const ev of evaluations) {
    evalMap.set(ev.attendee_id, ev)
  }

  // Check if any evaluations have non-trivial comments
  const hasAnyComments = evaluations.some(
    (ev) => hasComment(ev.additional_comments) || hasComment(ev.comments_not_acceptable)
  )

  function toggleComment(attendeeId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(attendeeId)) {
        next.delete(attendeeId)
      } else {
        next.add(attendeeId)
      }
      return next
    })
  }

  if (attendees.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          No attendees registered yet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Comment toggle + filter tabs */}
      <div className="flex items-center gap-3 flex-wrap">
      {hasAnyComments && (
        <button
          onClick={() => {
            const allCommentIds = filteredAttendees
              .filter((a) => {
                const ev = evalMap.get(a.id)
                return ev && (hasComment(ev.additional_comments) || hasComment(ev.comments_not_acceptable))
              })
              .map((a) => a.id)
            const allExpanded = allCommentIds.every((id) => expandedComments.has(id))
            if (allExpanded) {
              setExpandedComments(new Set())
            } else {
              setExpandedComments(new Set(allCommentIds))
            }
          }}
          className="rounded-md px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {expandedComments.size > 0 ? "Hide Comments" : "Show Comments"}
        </button>
      )}
      {sessionCompleted && noShowCount > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
              filter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input hover:bg-accent"
            }`}
          >
            All ({attendees.length})
          </button>
          <button
            onClick={() => setFilter("no-shows")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
              filter === "no-shows"
                ? "bg-amber-600 text-white border-amber-600"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            No-Shows ({noShowCount})
          </button>
        </div>
      )}
      </div>

    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">License #</th>
            <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
              Email
            </th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
              Registered
            </th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
              Checked In
            </th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Evaluated</th>
            <th className="text-right px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredAttendees.map((a) => {
            const ev = evalMap.get(a.id)
            const attendeeHasComment =
              ev && (hasComment(ev.additional_comments) || hasComment(ev.comments_not_acceptable))
            const isExpanded = expandedComments.has(a.id)
            const isEditing = editingRows.has(a.id)

            return (
              <Fragment key={a.id}>
              <tr className={`border-b last:border-0 ${isExpanded || isEditing ? "border-b-0" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {a.first_name} {a.last_name}
                    {attendeeHasComment && (
                      <button
                        onClick={() => toggleComment(a.id)}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs bg-blue-100 text-blue-600 hover:bg-blue-200 flex-shrink-0"
                        title="View evaluation comments"
                      >
                        {isExpanded ? "−" : "💬"}
                      </button>
                    )}
                  </div>
                  {isExpanded && ev && (
                    <div className="mt-2 space-y-1.5 text-xs">
                      {hasComment(ev.additional_comments) && (
                        <div className="rounded bg-blue-50 px-3 py-2 text-blue-800">
                          <span className="font-medium">Comment:</span>{" "}
                          {ev.additional_comments}
                        </div>
                      )}
                      {hasComment(ev.comments_not_acceptable) && (
                        <div className="rounded bg-amber-50 px-3 py-2 text-amber-800">
                          <span className="font-medium">Not acceptable:</span>{" "}
                          {ev.comments_not_acceptable}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{a.license_number}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  {a.email}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <StatusBadge status={a.status} />
                    <PaymentBadge
                      attendee={a}
                      refundDate={refundDateMap.get(a.id) ?? null}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {formatTimestamp(a.registered_at)}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {formatTimestamp(a.checked_in_at)}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                  <div>{formatTimestamp(a.evaluated_at)}</div>
                  {(() => {
                    const cert = certMap.get(a.id)
                    return cert?.pdf_url ? (
                      <div className="mt-1">
                        <a
                          href={cert.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          View Certificate
                        </a>
                        {cert.delivery_status === "failed" && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            (email failed)
                          </span>
                        )}
                      </div>
                    ) : null
                  })()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {a.status === "registered" ? (
                      <ManualCheckInButton
                        sessionId={sessionId}
                        attendeeId={a.id}
                      />
                    ) : a.status === "certified" ? (
                      <ResendCertButton
                        sessionId={sessionId}
                        attendeeId={a.id}
                        label="Resend Cert"
                      />
                    ) : a.status === "evaluated" ? (
                      <ResendCertButton
                        sessionId={sessionId}
                        attendeeId={a.id}
                        label="Generate Cert"
                      />
                    ) : null}
                    {a.status === "checked_in" && (
                      <EmailEvalLinkButton sessionId={sessionId} attendeeId={a.id} />
                    )}
                    {a.stripe_payment_intent_id &&
                      a.refunded_total_cents < a.paid_amount_cents && (
                        <RefundButton
                          attendeeId={a.id}
                          remainingCents={
                            a.paid_amount_cents - a.refunded_total_cents
                          }
                        />
                      )}
                    <EditAttendeeButton
                      editing={isEditing}
                      onToggle={() => toggleEditing(a.id)}
                    />
                    <RemoveAttendeeButton
                      sessionId={sessionId}
                      attendeeId={a.id}
                      attendeeName={`${a.first_name} ${a.last_name}`}
                    />
                  </div>
                </td>
              </tr>
              {isEditing && (
                <EditAttendeeRow
                  sessionId={sessionId}
                  attendee={a}
                  onClose={() => toggleEditing(a.id)}
                />
              )}
            </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
    </div>
  )
}
