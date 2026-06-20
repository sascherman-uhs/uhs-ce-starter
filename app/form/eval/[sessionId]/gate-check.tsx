"use client"

import { useState } from "react"
import { normalizeLicenseNumber } from "@/lib/registration/license"

/**
 * Gate Check Component
 * Asks for license number first, verifies check-in status via API,
 * then either shows the eval form or redirects to check-in.
 */
export function GateCheck({ sessionId }: { sessionId: string }) {
  const [license, setLicense] = useState("")
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notCheckedIn, setNotCheckedIn] = useState(false)
  const [alreadyEvaluated, setAlreadyEvaluated] = useState(false)
  const [attendeeName, setAttendeeName] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError(null)
    setNotCheckedIn(false)
    setAlreadyEvaluated(false)

    const normalized = normalizeLicenseNumber(license)

    // Validate format client-side first
    if (!/^(S|BS|B|PM|PB)\.\d{1,7}$/.test(normalized)) {
      setError("Invalid format. Use prefix.numbers (e.g., S.1234567)")
      setChecking(false)
      return
    }

    try {
      const res = await fetch(
        `/api/eval/gate-check?sessionId=${sessionId}&license=${encodeURIComponent(normalized)}`
      )
      const data = await res.json()

      if (data.status === "checked_in") {
        // Redirect to same page with license param to show eval form
        window.location.href = `/form/eval/${sessionId}?license=${encodeURIComponent(normalized)}`
        return
      }

      if (data.status === "evaluated" || data.status === "certified") {
        setAlreadyEvaluated(true)
        setAttendeeName(data.name || null)
        setChecking(false)
        return
      }

      if (data.status === "registered") {
        setNotCheckedIn(true)
        setChecking(false)
        return
      }

      if (data.status === "not_found") {
        setError(
          "This license number is not registered for this class."
        )
        setChecking(false)
        return
      }

      setError(data.error || "Something went wrong. Please try again.")
      setChecking(false)
    } catch {
      setError("Network error. Please try again.")
      setChecking(false)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error */}
        {error && !notCheckedIn && !alreadyEvaluated && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Already evaluated */}
        {alreadyEvaluated && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4 text-center space-y-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Evaluation already submitted!
            </p>
            {attendeeName && (
              <p className="text-sm text-green-600 dark:text-green-500">
                {attendeeName}, your certificate has been sent.
              </p>
            )}
          </div>
        )}

        {/* Not checked in */}
        {notCheckedIn && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Please check in before completing the evaluation.
            </p>
            <a
              href={`/form/checkin/${sessionId}`}
              className="block w-full rounded-md bg-amber-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-amber-700"
            >
              Go to Check-In
            </a>
          </div>
        )}

        {/* License input */}
        <div className="space-y-1.5">
          <label htmlFor="gate_license" className="text-sm font-medium">
            License Number
          </label>
          <input
            id="gate_license"
            type="text"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            required
            placeholder="S.1234567"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            inputMode="text"
            className="w-full rounded-md border border-input bg-background px-4 py-4 text-lg font-mono text-center tracking-wider"
          />
          <p className="text-xs text-muted-foreground text-center">
            Enter your license number to access the evaluation
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-md bg-primary px-6 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {checking ? "Verifying..." : "Continue to Evaluation"}
        </button>
      </form>
    </div>
  )
}
