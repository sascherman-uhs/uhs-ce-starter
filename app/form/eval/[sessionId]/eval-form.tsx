"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { submitEvaluation, type EvalState } from "../actions"

// ============================================================
// NRED 612C Evaluation Form — mirrors the official form exactly
// ============================================================
// I.  INSTRUCTOR (5 categories)
// II. CONTENT/MATERIALS (5 categories)
// Scale: Excellent / Average / Not Acceptable
// Comments for "Not Acceptable" ratings + Additional comments
// ============================================================

type RatingField = {
  name: string
  label: string
}

// Field names match ce_evaluations table column names exactly
const INSTRUCTOR_FIELDS: RatingField[] = [
  { name: "instructor_knowledge", label: "Knowledge of course content" },
  {
    name: "instructor_questions_examples",
    label: "Questions answered / Examples used",
  },
  { name: "instructor_presented_topics", label: "Presented all topics on outline" },
  { name: "instructor_timely", label: "Timely start and finish of class" },
  {
    name: "instructor_control_disruptions",
    label: "Ability to control disruptions",
  },
]

const CONTENT_FIELDS: RatingField[] = [
  { name: "content_objectives", label: "Course objectives / outcomes" },
  { name: "content_organization", label: "Organization of materials" },
  { name: "content_practical_value", label: "Practical value of content" },
  { name: "content_resource_value", label: "Value of resource materials" },
  { name: "content_current", label: "Content and materials current" },
]

const RATING_OPTIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "average", label: "Average" },
  { value: "not_acceptable", label: "Not Acceptable" },
] as const

function RatingRow({ field }: { field: RatingField }) {
  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <p className="text-sm font-medium mb-2">{field.label}</p>
      <div className="flex gap-2">
        {RATING_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex-1 cursor-pointer"
          >
            <input
              type="radio"
              name={field.name}
              value={option.value}
              required
              className="sr-only peer"
            />
            <span className="block text-center text-xs py-2.5 px-1 rounded-md border border-input bg-background peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary transition-colors">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function EvalSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-6 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Submitting..." : "Submit Evaluation"}
    </button>
  )
}

export function EvalForm({
  sessionId,
  licenseNumber,
}: {
  sessionId: string
  licenseNumber: string
}) {
  const [state, formAction] = useFormState<EvalState, FormData>(
    submitEvaluation,
    {}
  )

  // Track if any "Not Acceptable" is selected to show comments prompt
  const [hasNotAcceptable, setHasNotAcceptable] = useState(false)

  function handleFormChange(e: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(e.currentTarget)
    const allValues = Array.from(formData.values())
    setHasNotAcceptable(allValues.includes("not_acceptable"))
  }

  return (
    <form action={formAction} onChange={handleFormChange} className="space-y-6">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="license_number" value={licenseNumber} />

      {/* Error display */}
      {state.error &&
        !state.notCheckedIn &&
        !state.alreadyEvaluated && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {state.error}
          </div>
        )}

      {/* Already evaluated */}
      {state.alreadyEvaluated && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4 text-center space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Evaluation already submitted!
          </p>
          {state.attendeeName && (
            <p className="text-sm text-green-600 dark:text-green-500">
              {state.attendeeName}, your certificate has been sent.
            </p>
          )}
        </div>
      )}

      {/* Not checked in */}
      {state.notCheckedIn && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {state.error}
          </p>
          <a
            href={`/form/checkin/${sessionId}`}
            className="block w-full rounded-md bg-amber-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-amber-700"
          >
            Go to Check-In
          </a>
        </div>
      )}

      {/* I. INSTRUCTOR */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          I. Instructor
        </h2>
        <div className="rounded-lg border border-border p-3">
          {INSTRUCTOR_FIELDS.map((field) => (
            <RatingRow key={field.name} field={field} />
          ))}
        </div>
      </div>

      {/* II. CONTENT/MATERIALS */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          II. Content / Materials
        </h2>
        <div className="rounded-lg border border-border p-3">
          {CONTENT_FIELDS.map((field) => (
            <RatingRow key={field.name} field={field} />
          ))}
        </div>
      </div>

      {/* "Not Acceptable" comments — shown when any Not Acceptable is selected */}
      {hasNotAcceptable && (
        <div className="space-y-1.5">
          <label
            htmlFor="comments_not_acceptable"
            className="text-sm font-medium"
          >
            Comments about &ldquo;Not Acceptable&rdquo; ratings
          </label>
          <textarea
            id="comments_not_acceptable"
            name="comments_not_acceptable"
            rows={3}
            placeholder="Please explain your Not Acceptable rating(s)..."
            className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm resize-none"
          />
        </div>
      )}

      {/* Additional comments (always visible, optional) */}
      <div className="space-y-1.5">
        <label htmlFor="additional_comments" className="text-sm font-medium">
          Additional comments{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="additional_comments"
          name="additional_comments"
          rows={3}
          placeholder="Any additional feedback..."
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm resize-none"
        />
      </div>

      {/* Submit */}
      <EvalSubmitButton />

      <p className="text-xs text-center text-muted-foreground">
        Your certificate will be emailed immediately after submission.
      </p>
    </form>
  )
}
