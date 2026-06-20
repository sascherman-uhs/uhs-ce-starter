"use client"

import { useFormState, useFormStatus } from "react-dom"
import { useState } from "react"
import { createSession, type CreateSessionState } from "../actions"
import { formatCents } from "@/lib/money"

type Course = {
  id: string
  title: string
  course_number: string
  credit_hours: number
  fee_cents: number   // Phase 8 addition (D-01)
}

function SessionSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Creating..." : "Create Session"}
    </button>
  )
}

export function SessionForm({ courses }: { courses: Course[] }) {
  const [state, formAction] = useFormState<CreateSessionState, FormData>(
    createSession,
    {}
  )

  // Phase 8 (D-01): Track selected course so the Pricing helper text can show
  // the linked course's current default fee. Uncontrolled fallback: when JS
  // is disabled the <select> still posts course_id via name="course_id" and
  // the SSR-rendered helper shows the first course's default.
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    courses[0]?.id ?? ""
  )
  const selectedCourse =
    courses.find((c) => c.id === selectedCourseId) ?? courses[0]
  const courseDefaultDollars = selectedCourse
    ? formatCents(selectedCourse.fee_cents)
    : "$0.00"

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Course Selection */}
      <div className="space-y-2">
        <label htmlFor="course_id" className="text-sm font-medium">
          Course
        </label>
        <select
          id="course_id"
          name="course_id"
          required
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select a course...</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title} ({course.course_number}, {course.credit_hours}hr)
            </option>
          ))}
        </select>
        {state.fieldErrors?.course_id && (
          <p className="text-sm text-destructive">{state.fieldErrors.course_id[0]}</p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-2">
        <label htmlFor="session_date" className="text-sm font-medium">
          Date
        </label>
        <input
          id="session_date"
          name="session_date"
          type="date"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {state.fieldErrors?.session_date && (
          <p className="text-sm text-destructive">{state.fieldErrors.session_date[0]}</p>
        )}
      </div>

      {/* Time Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="start_time" className="text-sm font-medium">
            Start Time
          </label>
          <input
            id="start_time"
            name="start_time"
            type="time"
            required
            defaultValue="10:00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {state.fieldErrors?.start_time && (
            <p className="text-sm text-destructive">{state.fieldErrors.start_time[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="end_time" className="text-sm font-medium">
            End Time
          </label>
          <input
            id="end_time"
            name="end_time"
            type="time"
            required
            defaultValue="13:00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {state.fieldErrors?.end_time && (
            <p className="text-sm text-destructive">{state.fieldErrors.end_time[0]}</p>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label htmlFor="location_name" className="text-sm font-medium">
          Brokerage / Location Name
        </label>
        <input
          id="location_name"
          name="location_name"
          type="text"
          required
          placeholder="e.g., Coldwell Banker Premier Realty"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {state.fieldErrors?.location_name && (
          <p className="text-sm text-destructive">{state.fieldErrors.location_name[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="location_address" className="text-sm font-medium">
          Address <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="location_address"
          name="location_address"
          type="text"
          placeholder="e.g., 3185 St Rose Pkwy #100, Henderson NV 89052"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Coordinator */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="coordinator_name" className="text-sm font-medium">
            Coordinator Name
          </label>
          <input
            id="coordinator_name"
            name="coordinator_name"
            type="text"
            required
            placeholder="e.g., Annie Manderscheid"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {state.fieldErrors?.coordinator_name && (
            <p className="text-sm text-destructive">{state.fieldErrors.coordinator_name[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="coordinator_email" className="text-sm font-medium">
            Coordinator Email
          </label>
          <input
            id="coordinator_email"
            name="coordinator_email"
            type="email"
            required
            placeholder="e.g., annie@coldwellbanker.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {state.fieldErrors?.coordinator_email && (
            <p className="text-sm text-destructive">{state.fieldErrors.coordinator_email[0]}</p>
          )}
        </div>
      </div>

      {/* Phase 8 — Pricing block */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Pricing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Session fee (per D-01) */}
          <div className="space-y-1">
            <label htmlFor="fee_dollars" className="text-sm font-medium">
              Session fee
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                $
              </span>
              <input
                id="fee_dollars"
                name="fee_dollars"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                pattern="[0-9]*\.?[0-9]*"
                className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to use the course default ({courseDefaultDollars}). Enter $0 for a free class.
            </p>
            {state.fieldErrors?.fee_dollars && (
              <p className="text-xs text-destructive">{state.fieldErrors.fee_dollars[0]}</p>
            )}
          </div>

          {/* Attached coupon code (per D-11) */}
          <div className="space-y-1">
            <label htmlFor="attached_coupon_code" className="text-sm font-medium">
              Pre-applied coupon code
            </label>
            <input
              id="attached_coupon_code"
              name="attached_coupon_code"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="EARLYBIRD"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Optional. If set, anyone using this session&apos;s registration link gets this code auto-filled. Manage codes in Stripe Dashboard.
            </p>
            {state.fieldErrors?.attached_coupon_code && (
              <p className="text-xs text-destructive">{state.fieldErrors.attached_coupon_code[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-4 pt-4">
        <SessionSubmitButton />
        <a
          href="/admin"
          className="rounded-md border border-input px-6 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
