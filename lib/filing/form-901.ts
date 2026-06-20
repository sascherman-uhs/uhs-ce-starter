import ExcelJS from "exceljs"
import { format, parse } from "date-fns"

// ============================================================
// Form 901 Generator — STATE CE Calendar Schedule (EXAMPLE: Nevada/NRED)
// ============================================================
// TODO: customize for your state. This entire module reproduces ONE state's
// (Nevada Real Estate Division) course-offering submission form as a worked
// example. Your state's regulator will have DIFFERENT forms, fields, column
// layouts, instructions, and submission addresses — or may not require a
// spreadsheet at all. Replace the constants and layout below with your
// jurisdiction's actual reporting requirements before going live.
//
// Generates a single-row .xlsx matching the official NRED Form 901
// "CE Calendar Schedule Template for Submission" template.
//
// Why this exists (May 1, 2026):
//   On May 1, 2026 the NRED Education Section (roster-filing@your-state.gov)
//   REJECTED Acme Staging Co.'s plain-text course-offering
//   notification emails — verbatim:
//     "course offerings must be submitted using Form 901 to ensure
//      consistency and proper processing by the Division. Submissions
//      in email format alone do not meet the required format for
//      course offering notifications."
//   Form 901 is the required submission template. This module
//   generates a populated Form 901 attachment that gets stapled
//   onto the cascade-generated Outlook draft.
//
// Layout:
//   Row 1: Department header (merged A1:G1)
//   Row 2: "SCHEDULE OF CONTINUING EDUCATION CLASSES" (merged A2:G2)
//   Row 3: 7 numbered submission instructions (merged A3:G3, wrapped)
//   Row 4: "GENERAL" designation banner (merged A4:G4, gray fill)
//   Row 5: Column headers (Class Date | Course Title | Hours | CE # |
//          Class Location | Instructor | Sponsor)
//   Row 6: Single populated data row from params
//
// A prior submission style trimmed all 8 other designation
// sections (AGENCY, BROKER MANAGEMENT, BUSINESS BROKER, CONTRACTS,
// ETHICS, LAW & LEGISLATION, PROPERTY MANAGEMENT, RISK REDUCTION).
// Example: a course that files under GENERAL only.
// ============================================================

// TODO: customize for your school/state — these are your sponsor identity and
// the (Nevada example) class-location convention. Set the instructor to your
// state-approved instructor of record.
const SPONSOR_NAME = "ACME STAGING CO."
const SPONSOR_PHONE = "555-555-5555"
const INSTRUCTOR_NAME = "INSTRUCTOR NAME" // set to your approved instructor name
const CLASS_LOCATION_CITY = "Your City" // example state wanted city only

// TODO: customize for your state — this is the Nevada Real Estate Division's
// public form header (department name, office address, contact). Replace with
// YOUR regulator's header, or remove if your state's form differs.
const DEPARTMENT_HEADER =
  "STATE REAL ESTATE DIVISION  [Department Name]  [Office Address]  [Phone]  [filing-email@your-state.gov]"

const SCHEDULE_TITLE = "SCHEDULE OF CONTINUING EDUCATION CLASSES"

// TODO: customize for your state — these submission instructions are an EXAMPLE
// paraphrased from one state's CE form. Replace with your regulator's actual
// instructions and submission email/portal.
const INSTRUCTIONS = [
  "1. Submit course offering schedules on your regulator's required cadence.",
  "2. Re-submit as updated whenever the schedule changes (additions, cancellations, reschedules).",
  "3. Provide complete course numbers in your state's format (e.g. CE.0123456-RE).",
  "4. Enter the Class Location in your regulator's required form (e.g. city only).",
  "5. The sponsor is responsible for the accuracy and timeliness of all entries.",
  "6. Email/upload the completed form to your regulator's filing address.",
  "7. Sponsor name and contact information are required on every row.",
].join("\n")

export interface Form901Params {
  /** Session date as "yyyy-MM-dd" */
  sessionDate: string
  /** Start time as "HH:mm" (24h) */
  startTime: string
  /** Course title — already uppercase from the ce_courses record */
  courseTitle: string
  /** Course number, e.g. "CE.0000000-RE" */
  courseNumber: string
  /** Credit hours (numeric or string) */
  creditHours: string | number
}

export interface Form901Result {
  buffer: Buffer
  filename: string
}

/**
 * Generate a populated Form 901 .xlsx for a single CE class offering.
 *
 * Returns a Buffer suitable for the `attachments` parameter of
 * `draftViaOutlook` (lib/email/outlook-draft.ts).
 *
 * Filename convention: "Form 901 - Acme Staging Co. - YYYY-MM.xlsx"
 * derived from sessionDate.
 */
export async function generateForm901(
  params: Form901Params
): Promise<Form901Result> {
  const parsedDate = parse(params.sessionDate, "yyyy-MM-dd", new Date())
  // Supabase Postgres `time` columns serialize as "HH:mm:ss" (e.g. "13:00:00"); slice to
  // "HH:mm" so the parse format works for both 5- and 8-char inputs.
  const parsedStart = parse(params.startTime.slice(0, 5), "HH:mm", new Date())

  // "1:00 p.m." style — a common NRED submission style.
  const formattedStartTime = format(parsedStart, "h:mm a")
    .replace("AM", "a.m.")
    .replace("PM", "p.m.")

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Acme Staging CE System"
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet("CE Calendar")

  // Column widths (A..G) — chosen to match the visual flow of NRED's
  // template: narrow date/hours/CE#, wide title/sponsor.
  worksheet.columns = [
    { width: 14 }, // A: Class Date
    { width: 50 }, // B: Course Title
    { width: 12 }, // C: Hours
    { width: 18 }, // D: CE #
    { width: 18 }, // E: Class Location
    { width: 24 }, // F: Instructor
    { width: 32 }, // G: Sponsor Name and Contact Information
  ]

  // ----- Row 1: Department header (merged A1:G1) -----
  worksheet.mergeCells("A1:G1")
  const headerCell = worksheet.getCell("A1")
  headerCell.value = DEPARTMENT_HEADER
  headerCell.font = { bold: true, size: 10 }
  headerCell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  }
  worksheet.getRow(1).height = 36

  // ----- Row 2: Schedule title (merged A2:G2) -----
  worksheet.mergeCells("A2:G2")
  const titleCell = worksheet.getCell("A2")
  titleCell.value = SCHEDULE_TITLE
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: "center", vertical: "middle" }
  worksheet.getRow(2).height = 22

  // ----- Row 3: 7 numbered instructions (merged A3:G3, wrapped) -----
  worksheet.mergeCells("A3:G3")
  const instrCell = worksheet.getCell("A3")
  instrCell.value = INSTRUCTIONS
  instrCell.font = { size: 10 }
  instrCell.alignment = { vertical: "top", wrapText: true }
  worksheet.getRow(3).height = 100

  // ----- Row 4: GENERAL designation banner (merged A4:G4, gray fill) -----
  worksheet.mergeCells("A4:G4")
  const designationCell = worksheet.getCell("A4")
  designationCell.value = "GENERAL"
  designationCell.font = { bold: true, size: 12 }
  designationCell.alignment = { horizontal: "center", vertical: "middle" }
  designationCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9D9D9" },
  }
  worksheet.getRow(4).height = 20

  // ----- Row 5: Column headers -----
  const headerRow = worksheet.getRow(5)
  const columnHeaders = [
    "Class Date",
    "Course Title",
    "Hours",
    "CE #",
    "Class Location",
    "Instructor",
    "Sponsor Name and Contact Information",
  ]
  columnHeaders.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = label
    cell.font = { bold: true, size: 11 }
    cell.alignment = { vertical: "top", wrapText: true }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    }
  })
  headerRow.height = 30
  headerRow.commit()

  // ----- Row 6: Single populated data row -----
  const dataRow = worksheet.getRow(6)

  // A6: Class Date — real Date object with m/d/yyyy format.
  // Use noon UTC to avoid date drift across viewer timezones (a midnight-local
  // Date in UTC-7 would read as the previous day in UTC+ timezones).
  const dateOnly = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      12,
      0,
      0
    )
  )
  const dateCell = dataRow.getCell(1)
  dateCell.value = dateOnly
  dateCell.numFmt = "m/d/yyyy"
  dateCell.alignment = { vertical: "top" }

  // B6: Course Title (already uppercase from ce_courses)
  const titleDataCell = dataRow.getCell(2)
  titleDataCell.value = params.courseTitle
  titleDataCell.alignment = { vertical: "top", wrapText: true }

  // C6: Hours — combined credit-hours + start-time string with newline.
  // A common style: "3 \n(1:00 p.m.)"
  const hoursCell = dataRow.getCell(3)
  hoursCell.value = `${params.creditHours} \n(${formattedStartTime})`
  hoursCell.alignment = { vertical: "top", wrapText: true }

  // D6: CE # — force text format so Excel doesn't reinterpret
  // the leading "CE." literal as anything else.
  const ceCell = dataRow.getCell(4)
  ceCell.value = params.courseNumber
  ceCell.numFmt = "@"
  ceCell.alignment = { vertical: "top" }

  // E6: Class Location (city only per NRED instruction #5)
  const locationCell = dataRow.getCell(5)
  locationCell.value = CLASS_LOCATION_CITY
  locationCell.alignment = { vertical: "top" }

  // F6: Instructor
  const instructorCell = dataRow.getCell(6)
  instructorCell.value = INSTRUCTOR_NAME
  instructorCell.alignment = { vertical: "top" }

  // G6: Sponsor — name + phone, newline-separated, wrapped
  const sponsorCell = dataRow.getCell(7)
  sponsorCell.value = `${SPONSOR_NAME}\n${SPONSOR_PHONE}`
  sponsorCell.alignment = { vertical: "top", wrapText: true }

  dataRow.height = 30
  dataRow.commit()

  // Generate buffer (mirror roster-785a.ts pattern)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer)

  const filename = `Form 901 - Acme Staging Co. - ${format(parsedDate, "yyyy-MM")}.xlsx`

  return { buffer, filename }
}
