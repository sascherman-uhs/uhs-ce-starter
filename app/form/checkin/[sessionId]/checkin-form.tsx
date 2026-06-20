"use client"

import { useFormState, useFormStatus } from "react-dom"
import { checkInForSession, type CheckInState } from "../actions"

function CheckInSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-6 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Checking in..." : "Check In"}
    </button>
  )
}

export function CheckInForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState<CheckInState, FormData>(
    checkInForSession,
    {}
  )

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="session_id" value={sessionId} />

      {/* Error message */}
      {state.error && !state.notRegistered && !state.alreadyCheckedIn && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Already checked in */}
      {state.alreadyCheckedIn && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4 text-center space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Already checked in!
          </p>
          {state.attendeeName && (
            <p className="text-sm text-green-600 dark:text-green-500">
              {state.attendeeName}, you&apos;re all set.
            </p>
          )}
        </div>
      )}

      {/* Not registered — offer walk-in */}
      {state.notRegistered && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {state.error}
          </p>
          <a
            href={`/form/register/${sessionId}`}
            className="block w-full rounded-md bg-amber-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-amber-700"
          >
            Register as Walk-In
          </a>
        </div>
      )}

      {/* License Number Input */}
      <div className="space-y-1.5">
        <label htmlFor="license_number" className="text-sm font-medium">
          License Number
        </label>
        <input
          id="license_number"
          name="license_number"
          type="text"
          required
          placeholder="S.1234567"
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          inputMode="text"
          className="w-full rounded-md border border-input bg-background px-4 py-4 text-lg font-mono text-center tracking-wider"
        />
        <p className="text-xs text-muted-foreground text-center">
          Format: S.1234567 or BS.1234567
        </p>
      </div>

      {/* Submit */}
      <CheckInSubmitButton />
    </form>
  )
}
