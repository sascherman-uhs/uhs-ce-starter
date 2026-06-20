import { getGlobalNoShows } from "@/lib/noshow/identify"
import { NoShowTable } from "./noshow-table"
import { SyncToFlodeskButton } from "./sync-button"

export default async function NoShowPage() {
  // Fetch all no-shows including opted-out (so admin can see and manage them)
  const allNoShows = await getGlobalNoShows({ includeOptedOut: true })
  const activeNoShows = allNoShows.filter((ns) => !ns.opted_out)
  const optedOutCount = allNoShows.length - activeNoShows.length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">No-Show Management</h1>
          <p className="text-muted-foreground">
            Attendees who registered but did not check in to completed sessions
          </p>
        </div>
        <a
          href="/admin"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to Sessions
        </a>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-md border p-6 text-center">
          <div className="text-3xl font-bold">{allNoShows.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Total No-Shows</div>
        </div>
        <div className="rounded-md border p-6 text-center">
          <div className="text-3xl font-bold text-yellow-600">
            {activeNoShows.length}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Eligible for Re-Engagement
          </div>
        </div>
        <div className="rounded-md border p-6 text-center">
          <div className="text-3xl font-bold text-red-600">{optedOutCount}</div>
          <div className="text-sm text-muted-foreground mt-1">Opted Out</div>
        </div>
      </div>

      {/* Flodesk Sync */}
      <div className="rounded-md border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Flodesk Re-Engagement</h2>
        <p className="text-sm text-muted-foreground">
          Push eligible no-shows to the Flodesk "CE Re-Engagement" segment.
          the background worker will execute the sync via Zapier MCP and Flodesk will
          auto-trigger the "New CE Class Available" email template.
        </p>
        <SyncToFlodeskButton noShowCount={activeNoShows.length} />
      </div>

      {/* No-Show Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          All No-Shows ({allNoShows.length})
        </h2>
        <NoShowTable noShows={allNoShows} />
      </div>
    </div>
  )
}
