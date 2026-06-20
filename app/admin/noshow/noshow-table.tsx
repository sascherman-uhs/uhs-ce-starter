"use client"

import { useFormState, useFormStatus } from "react-dom"
import { optOutAction, optInAction, type OptOutState } from "./actions"

type NoShowRow = {
  id: string
  first_name: string
  last_name: string
  license_number: string
  email: string
  opted_out: boolean
  session_date: string
  location_name: string
  course_title: string
}

function OptOutSubmitButton({ optedOut }: { optedOut: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
        optedOut
          ? "border-green-300 text-green-700 hover:bg-green-50"
          : "border-red-300 text-red-700 hover:bg-red-50"
      }`}
    >
      {pending ? "..." : optedOut ? "Opt Back In" : "Opt Out"}
    </button>
  )
}

function OptOutButton({ email, optedOut }: { email: string; optedOut: boolean }) {
  const action = optedOut ? optInAction : optOutAction
  const [state, formAction] = useFormState<OptOutState, FormData>(action, {})

  if (state.success) {
    return (
      <span className="text-xs text-green-600 font-medium">
        {optedOut ? "Opted back in" : "Opted out"}
      </span>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="email" value={email} />
      <OptOutSubmitButton optedOut={optedOut} />
      {state.error && (
        <span className="text-xs text-destructive ml-1">{state.error}</span>
      )}
    </form>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  })
}

export function NoShowTable({ noShows }: { noShows: NoShowRow[] }) {
  if (noShows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          No no-shows found across completed sessions.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Email</th>
            <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
              License #
            </th>
            <th className="text-left px-4 py-3 font-medium">Session Missed</th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
              Date
            </th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-right px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {noShows.map((ns) => (
            <tr
              key={ns.id}
              className={`border-b last:border-0 ${
                ns.opted_out ? "bg-muted/30 opacity-60" : ""
              }`}
            >
              <td className="px-4 py-3">
                {ns.first_name} {ns.last_name}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{ns.email}</td>
              <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">
                {ns.license_number}
              </td>
              <td className="px-4 py-3 text-xs">
                {ns.course_title}
                <br />
                <span className="text-muted-foreground">{ns.location_name}</span>
              </td>
              <td className="px-4 py-3 text-xs hidden lg:table-cell">
                {formatDate(ns.session_date)}
              </td>
              <td className="px-4 py-3">
                {ns.opted_out ? (
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                    Opted Out
                  </span>
                ) : (
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
                    No-Show
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <OptOutButton email={ns.email} optedOut={ns.opted_out} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
