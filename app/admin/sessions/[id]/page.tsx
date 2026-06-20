import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import { formatSessionDate, formatSessionTime, calculateFilingDeadline } from "@/lib/utils/dates"
import { QRCodeCard, CopyButton } from "./qr-code-card"
import { CascadeStatus } from "./cascade-status"
import { SendEmailButton } from "./send-email-button"
import { AttendeeList } from "./attendee-list"
import { AddAttendeeForm } from "./add-attendee-form"
import { FilingSection } from "./filing-section"
import { DivisionNoticeSection } from "./division-notice-section"
import { PricingSection } from "./pricing-section"
import { GenerateFlyerButton } from "./generate-flyer-button"
import { getSessionNoShowCount } from "@/lib/noshow/identify"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from("ce_sessions")
    .select(
      "*, ce_courses(title, course_number, credit_hours, instructor, sponsor, fee_cents)"
    )
    .eq("id", id)
    .single()

  if (!session) {
    notFound()
  }

  // Fetch attendees for this session
  const adminClient = createAdminClient()
  const { data: attendees } = await adminClient
    .from("ce_attendees")
    .select(
      "id, first_name, last_name, license_number, email, phone, status, registered_at, checked_in_at, paid_amount_cents, coupon_code, stripe_payment_intent_id, refunded_total_cents, evaluated_at, certified_at"
    )
    .eq("session_id", id)
    .order("last_name", { ascending: true })

  // Fetch evaluations with comments for this session
  const { data: evaluations } = await adminClient
    .from("ce_evaluations")
    .select("attendee_id, comments_not_acceptable, additional_comments")
    .eq("session_id", id)

  // Phase 8 (D-19): refund history for this session — used to render the
  // 'Refunded $X.XX on M/D' badge with the most-recent refund's date.
  const { data: refunds } = await adminClient
    .from("ce_refunds")
    .select("attendee_id, amount_cents, created_at, stripe_status")
    .eq("session_id", id)
    .order("created_at", { ascending: false })

  // Certificate records for this session — used to render the "View Certificate"
  // link (and a failed-delivery hint) inline in the attendee table.
  const { data: certificates } = await adminClient
    .from("ce_certificates")
    .select("attendee_id, pdf_url, delivery_status, delivered_at")
    .eq("session_id", id)

  // Fetch no-show stats for completed/filed sessions
  const isCompleted = session.status === "completed" || session.status === "filed"
  const noShowStats = isCompleted
    ? await getSessionNoShowCount(id)
    : { noShows: 0, totalRegistered: 0 }

  const course = session.ce_courses as any
  const cascade = (session.cascade_status as any) || {}

  // The the background worker /schedule-ce MCP-insert path doesn't set filing_deadline (only createSession does).
  // For past-dated sessions missing it, render the filing panel anyway with a display-only
  // 3-business-day fallback deadline.
  const sessionDateObj = new Date(session.session_date + "T00:00:00")
  const sessionIsPast = sessionDateObj.getTime() < new Date(new Date().toDateString()).getTime()
  let computedFilingDeadline: string | undefined = undefined
  if (!session.filing_deadline) {
    const d = calculateFilingDeadline(sessionDateObj)
    computedFilingDeadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  // Construct QR code URLs from convention
  const qrBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ce-assets/qr/${id}`
  const qrCodes = [
    {
      type: "Registration" as const,
      url: `${qrBaseUrl}/registration.png`,
      formUrl: `${APP_URL}/form/register/${id}`,
    },
    {
      type: "Check-in" as const,
      url: `${qrBaseUrl}/checkin.png`,
      formUrl: `${APP_URL}/form/checkin/${id}`,
    },
    {
      type: "Evaluation" as const,
      url: `${qrBaseUrl}/evaluation.png`,
      formUrl: `${APP_URL}/form/eval/${id}`,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {session.location_name}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                session.status === "scheduled"
                  ? "bg-blue-100 text-blue-700"
                  : session.status === "in_progress"
                  ? "bg-yellow-100 text-yellow-700"
                  : session.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : session.status === "filed"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {session.status}
            </span>
          </div>
          <p className="text-muted-foreground">
            {course?.title} | {formatSessionDate(session.session_date)}{" "}
            {formatSessionTime(session.start_time)} - {formatSessionTime(session.end_time)}
          </p>
        </div>
        <a
          href="/admin"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to Sessions
        </a>
      </div>

      {/* Session Details */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-md border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Session Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Course</dt>
              <dd>{course?.title}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Course Number</dt>
              <dd>{course?.course_number}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Credit Hours</dt>
              <dd>{course?.credit_hours}hr {course?.credit_type || "General"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatSessionDate(session.session_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Time</dt>
              <dd>
                {formatSessionTime(session.start_time)} -{" "}
                {formatSessionTime(session.end_time)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Location</dt>
              <dd className="text-right">
                {session.location_name}
                {session.location_address && (
                  <div className="text-muted-foreground">{session.location_address}</div>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Instructor</dt>
              <dd>{course?.instructor}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-6">
          {/* Coordinator */}
          <div className="rounded-md border p-6 space-y-4">
            <h2 className="text-lg font-semibold">Coordinator</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{session.coordinator_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  <a
                    href={`mailto:${session.coordinator_email}`}
                    className="text-primary hover:underline"
                  >
                    {session.coordinator_email}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          {/* Cascade Status */}
          <CascadeStatus cascade={cascade} sessionId={id} />

          {/* Cascade Incomplete Banner */}
          {cascade.qr_codes?.completed_at && !cascade.calendar?.completed_at && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">Cascade Incomplete</p>
              <p className="text-xs text-amber-700 mt-1">
                Trigger the scheduling cascade for this session from your background worker
                to complete the remaining steps (flyer, email, calendar).
              </p>
            </div>
          )}

          {/* Send Email Action */}
          {cascade.qr_codes?.completed_at && !cascade.email?.completed_at && (
            <div className="rounded-md border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Send Coordinator Email</h3>
              <p className="text-xs text-muted-foreground">
                Send the scheduling confirmation email to {session.coordinator_name} with
                class details{cascade.flyer?.completed_at ? " and flyer attachment" : ""}.
              </p>
              <SendEmailButton sessionId={id} />
            </div>
          )}

          {/* Counts */}
          <div className="rounded-md border p-6">
            <h2 className="text-lg font-semibold mb-4">Attendees</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{session.registered_count}</div>
                <div className="text-xs text-muted-foreground">Registered</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{session.checked_in_count}</div>
                <div className="text-xs text-muted-foreground">Checked In</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{session.evaluated_count}</div>
                <div className="text-xs text-muted-foreground">Evaluated</div>
              </div>
            </div>
          </div>

          {/* No-Show Summary */}
          {isCompleted && noShowStats.noShows > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-lg font-semibold text-amber-900 mb-2">No-Shows</h2>
              <p className="text-2xl font-bold text-amber-700">
                {noShowStats.noShows}{" "}
                <span className="text-sm font-normal text-amber-600">
                  out of {noShowStats.totalRegistered} registered
                </span>
              </p>
              <p className="text-xs text-amber-600 mt-2">
                Registered but did not check in.
              </p>
              <a
                href="/admin/noshow"
                className="inline-block mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Manage No-Shows
              </a>
            </div>
          )}

          {/* Pricing — set/change fee + pre-applied coupon after creation */}
          <PricingSection
            session={session}
            sessionId={id}
            courseFeeCents={course?.fee_cents ?? 0}
          />

          {/* Division Schedule Notice — pre-class NRED notification (always actionable) */}
          {session.status !== "filed" && (
            <DivisionNoticeSection session={session} sessionId={id} />
          )}

          {/* Division Filing — post-class roster + eval summary */}
          {(session.status === "completed" ||
            session.status === "filed" ||
            session.filing_deadline ||
            sessionIsPast) && (
            <FilingSection
              session={session}
              sessionId={id}
              computedDeadline={computedFilingDeadline}
            />
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="rounded-md border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Quick Links</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-muted-foreground text-xs mb-1">Registration URL</div>
              <div className="truncate">{`${APP_URL}/form/register/${id}`}</div>
            </div>
            <CopyButton text={`${APP_URL}/form/register/${id}`} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-muted-foreground text-xs mb-1">Roster URL (share with coordinator)</div>
              <div className="truncate">{`${APP_URL}/roster/${id}`}</div>
            </div>
            <CopyButton text={`${APP_URL}/roster/${id}`} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-muted-foreground text-xs mb-1">Check-in URL</div>
              <div className="truncate">{`${APP_URL}/form/checkin/${id}`}</div>
            </div>
            <CopyButton text={`${APP_URL}/form/checkin/${id}`} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-muted-foreground text-xs mb-1">Evaluation URL</div>
              <div className="truncate">{`${APP_URL}/form/eval/${id}`}</div>
            </div>
            <CopyButton text={`${APP_URL}/form/eval/${id}`} />
          </div>
        </div>
      </div>

      {/* Attendee List */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              Attendees ({attendees?.length || 0})
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Refresh page to see latest check-ins
            </p>
          </div>
          <div className="flex items-start gap-2">
            <AddAttendeeForm sessionId={id} />
            <a
              href={`/admin/sessions/${id}/roster-print`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent whitespace-nowrap"
            >
              Print Roster
            </a>
          </div>
        </div>
        <AttendeeList
          sessionId={id}
          attendees={attendees || []}
          refunds={refunds || []}
          sessionCompleted={isCompleted}
          evaluations={evaluations || []}
          certificates={certificates || []}
        />
      </div>

      {/* QR Codes */}
      <div>
        <h2 className="text-lg font-semibold mb-4">QR Codes</h2>
        {cascade.qr_codes?.completed_at ? (
          <div className="grid grid-cols-3 gap-6">
            {qrCodes.map((qr) => (
              <QRCodeCard
                key={qr.type}
                type={qr.type}
                imageUrl={qr.url}
                formUrl={qr.formUrl}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              QR codes have not been generated yet. They are created automatically
              when a session is scheduled.
            </p>
          </div>
        )}
      </div>

      {/* Flyer */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Flyer</h2>
        {session.flyer_url ? (
          <div className="rounded-md border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Session Flyer (PDF)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generated flyer ready for distribution
                </p>
              </div>
              <div className="flex gap-3">
                <a
                  href={session.flyer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Download PDF
                </a>
                <div className="w-40">
                  <GenerateFlyerButton sessionId={id} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-8 text-center space-y-4">
            <p className="text-muted-foreground">
              No flyer has been generated yet.
            </p>
            <div className="max-w-xs mx-auto">
              <GenerateFlyerButton sessionId={id} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
