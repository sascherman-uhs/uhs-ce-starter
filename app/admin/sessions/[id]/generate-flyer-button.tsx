"use client"

import { useFormState, useFormStatus } from "react-dom"
import { generateFlyer, type GenerateFlyerState } from "../actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Generating..." : "Generate Flyer"}
    </button>
  )
}

export function GenerateFlyerButton({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState<GenerateFlyerState, FormData>(
    generateFlyer,
    {}
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      {state.error && (
        <p className="text-xs text-red-600 mb-2">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600 mb-2">Flyer generated successfully!</p>
      )}
      <SubmitButton />
    </form>
  )
}
