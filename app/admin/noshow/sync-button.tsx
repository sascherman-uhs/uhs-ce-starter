"use client"

import { useFormState, useFormStatus } from "react-dom"
import { syncToFlodeskAction, type SyncFlodeskState } from "./actions"

function SyncSubmitButton({ noShowCount }: { noShowCount: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || noShowCount === 0}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending
        ? "Queuing..."
        : `Sync ${noShowCount} No-Show${noShowCount !== 1 ? "s" : ""} to Flodesk`}
    </button>
  )
}

export function SyncToFlodeskButton({ noShowCount }: { noShowCount: number }) {
  const [state, formAction] = useFormState<SyncFlodeskState, FormData>(
    syncToFlodeskAction,
    {}
  )

  if (state.success) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm font-medium text-green-800">
          Sync queued
        </p>
        <p className="text-xs text-green-700 mt-1">
          the background worker will push {noShowCount} no-show{noShowCount !== 1 ? "s" : ""} to
          Flodesk during the next session.
        </p>
      </div>
    )
  }

  return (
    <div>
      <form action={formAction}>
        <SyncSubmitButton noShowCount={noShowCount} />
      </form>
      {state.error && (
        <p className="text-xs text-destructive mt-2">{state.error}</p>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Queues a sync for the background worker to push no-shows to the Flodesk "CE
        Re-Engagement" segment via MCP.
      </p>
    </div>
  )
}
