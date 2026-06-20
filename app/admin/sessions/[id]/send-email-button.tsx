"use client"

import { useFormState, useFormStatus } from "react-dom"
import { markCoordinatorEmailSent, type SendEmailState } from "../actions"

function MarkSentSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Updating..." : "Mark Email as Sent"}
    </button>
  )
}

export function SendEmailButton({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState<SendEmailState, FormData>(
    markCoordinatorEmailSent,
    {}
  )

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Coordinator emails are sent via Outlook. Once you&apos;ve sent or
        drafted the email, mark it as complete here.
      </p>
      <form action={formAction}>
        <input type="hidden" name="session_id" value={sessionId} />
        {state.error && (
          <p className="text-xs text-red-600 mb-2">{state.error}</p>
        )}
        {state.success && (
          <p className="text-xs text-green-600 mb-2">Marked as sent!</p>
        )}
        <MarkSentSubmitButton />
      </form>
    </div>
  )
}
