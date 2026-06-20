import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import { formatSessionDate, formatSessionTime } from "@/lib/utils/dates"
import { PrintControls } from "./print-controls"

// Live attendee data — never statically cached (mirrors app/roster/[sessionId]).
export const dynamic = "force-dynamic"

type CourseRow = {
  title?: string
  course_number?: string
  credit_hours?: number
  instructor?: string
}

export default async function RosterPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, location_address, ce_courses(title, course_number, credit_hours, instructor)"
    )
    .eq("id", id)
    .single()

  // Admin context — mirror the sibling detail page (notFound), not the public
  // roster's friendly error card.
  if (!session) {
    notFound()
  }

  // "Registered attendees" = ALL rows for the session. Statuses are lifecycle
  // supersets (checked_in / evaluated / certified all registered first; removal
  // deletes the row), so a status filter would wrongly drop already-checked-in
  // people from a mid-class reprint.
  const { data: attendees } = await admin
    .from("ce_attendees")
    .select("first_name, last_name, license_number, email")
    .eq("session_id", id)
    .order("last_name", { ascending: true })

  const courses = session.ce_courses as unknown as
    | CourseRow
    | CourseRow[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses

  const courseTitle = course?.title || "CE Class"
  const courseNumber = course?.course_number || "—"
  const creditHours = course?.credit_hours ?? 3
  const instructor = course?.instructor || "—"

  const attendeeList = attendees || []
  const n = attendeeList.length

  // Letter-page capacity estimates at the row heights below. Constants account
  // for the branded header (logo + flanking QR codes + gold rule) and the footer,
  // which render ONCE on page 1; page 2 carries only the repeated <thead>. Remain
  // tunable via print preview. One page preferred, two pages MAX (per requirement).
  const PAGE1_DATA_ROWS = 20 // data rows fitting on page 1 below the branded header
  const TWO_PAGE_MAX_ROWS = 48 // hard cap of data rows across two pages
  const blanks =
    n + 12 <= PAGE1_DATA_ROWS
      ? PAGE1_DATA_ROWS - n // small class: fill the remainder of page 1
      : Math.max(6, Math.min(12, TWO_PAGE_MAX_ROWS - n)) // larger class: 6-12 blanks, never past page 2

  const dateLabel = formatSessionDate(session.session_date)
  const timeLabel = `${formatSessionTime(session.start_time)} – ${formatSessionTime(
    session.end_time
  )}`
  const locationLabel = session.location_address
    ? `${session.location_name} — ${session.location_address}`
    : session.location_name

  // QR image URLs — same ce-assets storage convention as the session detail page.
  // `id` is already in scope from `params`. Registration QR flanks the header LEFT,
  // check-in QR flanks RIGHT, so attendees know which code to scan from the paper.
  const qrBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ce-assets/qr/${id}`
  const registrationQrUrl = `${qrBaseUrl}/registration.png`
  const checkinQrUrl = `${qrBaseUrl}/checkin.png`

  return (
    <div className="p-4 md:p-8">
      <PrintControls sessionId={id} />

      <div
        id="roster-print-sheet"
        className="mx-auto max-w-3xl bg-white text-black"
      >
        {/* Branded header — 3-column flex band. QR codes flank a branded center
            column (logo + navy title + gold label + metadata). Flanking consumes
            horizontal space (plentiful at max-w-3xl) so the page cap stays reachable. */}
        <div className="mb-3 flex items-start justify-between gap-4">
          {/* LEFT: registration QR */}
          <div className="shrink-0">
            <img
              src={registrationQrUrl}
              alt="Registration QR code"
              className="h-[1.3in] w-[1.3in] border border-black"
            />
            <p className="mt-0.5 text-center text-xs font-semibold text-[#1a1a2e]">
              Scan to Register
            </p>
          </div>

          {/* CENTER: logo + navy title + gold SIGN-IN SHEET label + metadata grid */}
          <div className="flex-1 text-center">
            <img
              src="/brand/logo.png"
              alt="Acme Staging Co."
              className="mx-auto h-[0.5in] w-auto"
            />
            <h1 className="text-xl font-bold leading-tight text-[#1a1a2e]">
              {courseTitle}
            </h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
              Sign-In Sheet
            </p>
            {/* inline-grid text-left keeps the metadata readable (not ragged)
                while logo/title/label stay centered in the column. */}
            <div className="mt-2 inline-grid grid-cols-2 gap-x-6 gap-y-0.5 text-left text-sm">
              <div>
                <span className="font-semibold text-[#1a1a2e]">Date:</span>{" "}
                {dateLabel}
              </div>
              <div>
                <span className="font-semibold text-[#1a1a2e]">Time:</span>{" "}
                {timeLabel}
              </div>
              <div className="col-span-2">
                <span className="font-semibold text-[#1a1a2e]">Location:</span>{" "}
                {locationLabel}
              </div>
              <div>
                <span className="font-semibold text-[#1a1a2e]">Course #:</span>{" "}
                {courseNumber}
              </div>
              <div>
                <span className="font-semibold text-[#1a1a2e]">Credit Hours:</span>{" "}
                {creditHours}
              </div>
              <div className="col-span-2">
                <span className="font-semibold text-[#1a1a2e]">Instructor:</span>{" "}
                {instructor}
              </div>
            </div>
          </div>

          {/* RIGHT: check-in QR */}
          <div className="shrink-0">
            <img
              src={checkinQrUrl}
              alt="Check-in QR code"
              className="h-[1.3in] w-[1.3in] border border-black"
            />
            <p className="mt-0.5 text-center text-xs font-semibold text-[#1a1a2e]">
              Scan to Check In
            </p>
          </div>
        </div>

        {/* Gold rule separating the header from the table (mirrors the flyer's
            gold divider, width 3px, canonical #c9a84c). */}
        <div className="mb-2 h-[3px] bg-[#c9a84c]" />

        {/* Attendee table — registered attendees + blank write-in rows. */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black bg-[#c9a84c]/20 px-2 py-1 text-left font-semibold text-[#1a1a2e] w-[28%]">
                Name
              </th>
              <th className="border border-black bg-[#c9a84c]/20 px-2 py-1 text-left font-semibold text-[#1a1a2e] w-[18%]">
                License Number
              </th>
              <th className="border border-black bg-[#c9a84c]/20 px-2 py-1 text-left font-semibold text-[#1a1a2e] w-[24%]">
                Email
              </th>
              <th className="border border-black bg-[#c9a84c]/20 px-2 py-1 text-left font-semibold text-[#1a1a2e] w-[30%]">
                Signature
              </th>
            </tr>
          </thead>
          <tbody>
            {attendeeList.map((a, i) => (
              <tr key={`filled-${i}`}>
                <td className="h-8 border border-black px-2 py-1.5">
                  {a.first_name} {a.last_name}
                </td>
                <td className="h-8 border border-black px-2 py-1.5 font-mono text-xs">
                  {a.license_number}
                </td>
                <td className="h-8 border border-black px-2 py-1.5 text-xs">
                  {a.email}
                </td>
                <td className="h-8 border border-black px-2 py-1.5" />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td className="h-8 border border-black px-2 py-1.5" />
                <td className="h-8 border border-black px-2 py-1.5" />
                <td className="h-8 border border-black px-2 py-1.5" />
                <td className="h-8 border border-black px-2 py-1.5" />
              </tr>
            ))}
          </tbody>
        </table>

        {/* Branded footer — muted gray over a gold top border. Literal em-dash
            (U+2014) and middle-dot (U+00B7). */}
        <p className="mt-3 border-t border-[#c9a84c] pt-1 text-center text-[10px] tracking-wide text-[#666666] [break-inside:avoid]">
          Acme Staging Co. — Continuing Education · ce.example.com
        </p>
      </div>

      {/* Print rules. The visibility-isolation pattern hides the admin layout's
          sidebar chrome WITHOUT touching layout files. globals.css has no
          competing print rules. Valid <style> in a Server Component. */}
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          body * { visibility: hidden; }
          #roster-print-sheet, #roster-print-sheet * { visibility: visible; }
          #roster-print-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          #roster-print-sheet table { page-break-inside: auto; }
          #roster-print-sheet thead { display: table-header-group; }
          #roster-print-sheet tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
