"use client"

import { useState, useEffect } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { addAttendee, type AddAttendeeState } from "../actions"

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null
  return <span className="text-xs text-destructive">{messages[0]}</span>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Adding..." : "Add"}
    </button>
  )
}

export function AddAttendeeForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState<AddAttendeeState, FormData>(
    addAttendee,
    {}
  )
  const [open, setOpen] = useState(false)

  // On success, collapse back to the trigger. revalidatePath has already
  // refreshed the server-rendered count + attendee list — do NOT mutate the
  // list client-side.
  useEffect(() => {
    if (state.success) {
      setOpen(false)
    }
  }, [state.success])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        Add Attendee
      </button>
    )
  }

  return (
    <form
      action={formAction}
      className="rounded-md border border-input bg-card p-3 text-left shadow-sm w-[20rem] sm:w-[28rem] space-y-2"
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <input
            name="first_name"
            placeholder="First name"
            className="w-full rounded border border-input px-2 py-1 text-sm"
          />
          <FieldError messages={state.fieldErrors?.first_name} />
        </div>
        <div className="space-y-1">
          <input
            name="last_name"
            placeholder="Last name"
            className="w-full rounded border border-input px-2 py-1 text-sm"
          />
          <FieldError messages={state.fieldErrors?.last_name} />
        </div>
        <div className="space-y-1">
          <input
            name="license_number"
            placeholder="License # (e.g. S.1234567)"
            className="w-full rounded border border-input px-2 py-1 text-sm font-mono"
          />
          <FieldError messages={state.fieldErrors?.license_number} />
        </div>
        <div className="space-y-1">
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="w-full rounded border border-input px-2 py-1 text-sm"
          />
          <FieldError messages={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <input
            name="phone"
            placeholder="Phone (optional)"
            className="w-full rounded border border-input px-2 py-1 text-sm"
          />
          <FieldError messages={state.fieldErrors?.phone} />
        </div>
      </div>

      {state.error && (
        <span className="block text-xs text-destructive">{state.error}</span>
      )}

      <div className="flex items-center gap-2 pt-1">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
