import ExcelJS from "exceljs"
import { format, parse } from "date-fns"

// ============================================================
// 785a Roster Generator — NRED Division Compliance
// ============================================================
// Generates .xlsx matching the official NRED Form 785A format.
// $500 fine per violation (NAC 645.695) — validate EVERYTHING.
//
// Columns (matching NRED template exactly):
//   A: Real Estate License Number
//   B: Student's Last Name Only
//   C: Course Number
//   D: Date Course Completed (MM/DD/YYYY)
//
// Data rows start at row 3 (row 1 = link, row 2 = headers).
// ============================================================

/** Known NRED license prefixes */
const VALID_PREFIXES = ["S", "BS", "B", "PM", "PB"] as const

/** Statuses that qualify for roster inclusion (attended the class) */
const ROSTER_ELIGIBLE_STATUSES = [
  "checked_in",
  "evaluated",
  "certified",
] as const

export type RosterAttendee = {
  id: string
  first_name: string
  last_name: string
  license_number: string
  email: string
  status: string
}

export type RosterValidationIssue = {
  attendeeId: string
  attendeeName: string
  licenseNumber: string
  field: "license_number" | "last_name"
  issue: string
  severity: "error" | "warning"
}

export type RosterResult = {
  buffer: Buffer
  filename: string
  rowCount: number
  validationIssues: RosterValidationIssue[]
  skippedCount: number
}

/**
 * Normalize a license number per NRED 785A rules:
 * - Uppercase the prefix
 * - Ensure period after prefix
 * - Strip leading zeros after the prefix
 * - Strip any suffix (Corp, LLC, Inc, Jr., Sr., II, III, etc.)
 * - Strip all whitespace
 *
 * Examples:
 *   "S.0123456"       -> "S.123456"
 *   "s.123456"        -> "S.123456"
 *   "BS.0023456"      -> "BS.23456"
 *   "B.32123 LLC"     -> "B.32123"
 *   "S.44556 Corp"    -> "S.44556"
 *   "PM.001234"       -> "PM.1234"
 *   "s0123456"        -> "S.123456"
 *   "bs.0123456"      -> "BS.123456"
 */
export function normalizeLicenseNumber(raw: string): {
  normalized: string | null
  issues: string[]
} {
  const issues: string[] = []
  let input = raw.trim()

  if (!input) {
    return { normalized: null, issues: ["License number is empty"] }
  }

  // Strip known suffixes (case-insensitive)
  const suffixPattern =
    /\s+(corp|llc|inc|jr\.?|sr\.?|ii|iii|iv)\.?\s*$/i
  if (suffixPattern.test(input)) {
    issues.push(`Stripped suffix from "${input}"`)
    input = input.replace(suffixPattern, "")
  }

  // Strip all spaces
  input = input.replace(/\s+/g, "")

  // Try to parse prefix and digits
  const match = input.match(/^(S|BS|B|PM|PB)\.?(\d+)$/i)
  if (!match) {
    return {
      normalized: null,
      issues: [
        `Invalid license format: "${raw}". Expected prefix (S, BS, B, PM, PB) followed by digits.`,
      ],
    }
  }

  const prefix = match[1].toUpperCase()
  let digits = match[2]

  // Strip leading zeros
  if (digits.startsWith("0")) {
    issues.push(
      `Stripped leading zeros: "${prefix}.${digits}" -> "${prefix}.${digits.replace(/^0+/, "")  || "0"}"`
    )
    digits = digits.replace(/^0+/, "") || "0"
  }

  // Validate prefix is one of the known types
  if (!VALID_PREFIXES.includes(prefix as any)) {
    return {
      normalized: null,
      issues: [`Unknown license prefix: "${prefix}"`],
    }
  }

  // Validate digit count (NRED licenses are typically 1-7 digits)
  if (digits.length > 7) {
    issues.push(
      `License number has ${digits.length} digits (expected 1-7): "${prefix}.${digits}"`
    )
  }

  return {
    normalized: `${prefix}.${digits}`,
    issues,
  }
}

/**
 * Normalize a last name per NRED 785A rules:
 * - Uppercase
 * - Strip suffixes (Jr., Sr., II, III, IV)
 * - Trim whitespace
 */
export function normalizeLastName(raw: string): {
  normalized: string | null
  issues: string[]
} {
  const issues: string[] = []
  let name = raw.trim()

  if (!name) {
    return { normalized: null, issues: ["Last name is empty"] }
  }

  // Strip name suffixes
  const nameSuffixPattern = /\s*(Jr\.?|Sr\.?|II|III|IV|V)\s*$/i
  if (nameSuffixPattern.test(name)) {
    issues.push(`Stripped name suffix from "${name}"`)
    name = name.replace(nameSuffixPattern, "").trim()
  }

  // Uppercase for NRED format
  const normalized = name.toUpperCase()

  return { normalized, issues }
}

/**
 * Generate a 785A roster .xlsx for a session.
 *
 * @param attendees - All attendees for the session (pre-fetched)
 * @param courseNumber - The full course number (e.g., "CE.0000000-RE")
 * @param sessionDate - Session date as "YYYY-MM-DD"
 * @returns RosterResult with buffer, filename, and validation details
 */
export async function generate785aRoster(
  attendees: RosterAttendee[],
  courseNumber: string,
  sessionDate: string
): Promise<RosterResult> {
  const validationIssues: RosterValidationIssue[] = []
  let skippedCount = 0

  // Validate course number format
  if (!/^(CE|POST)\.\d{7}-RE$/.test(courseNumber)) {
    throw new Error(
      `Invalid course number format: "${courseNumber}". Expected CE.XXXXXXX-RE or POST.XXXXX-RE`
    )
  }

  // Parse and format the session date as MM/DD/YYYY
  const parsedDate = parse(sessionDate, "yyyy-MM-dd", new Date())
  const formattedDate = format(parsedDate, "MM/dd/yyyy")

  // Filter to roster-eligible attendees only
  const eligibleAttendees = attendees.filter((a) =>
    ROSTER_ELIGIBLE_STATUSES.includes(a.status as any)
  )

  skippedCount = attendees.length - eligibleAttendees.length

  // Create workbook matching NRED 785A template format
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Acme Staging CE System"
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet("Roster Upload Form 785A")

  // Set column widths to match template
  worksheet.columns = [
    { width: 28.5 },  // A: License Number
    { width: 25.5 },  // B: Last Name
    { width: 22.2 },  // C: Course Number
    { width: 25.2 },  // D: Date Completed
  ]

  // Row 1: License Lookup hyperlink (matching template)
  const row1 = worksheet.getRow(1)
  const cell1A = row1.getCell(1)
  cell1A.value = {
    text: "License Lookup",
    hyperlink:
      "https://red.prod.secure.nv.gov/Lookup/LicenseLookup.aspx",
  } as ExcelJS.CellHyperlinkValue
  cell1A.font = {
    color: { argb: "FF0563C1" },
    underline: true,
    size: 11,
    name: "Times New Roman",
  }
  row1.commit()

  // Row 2: Column headers with rich formatting (matching template)
  const row2 = worksheet.getRow(2)

  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    size: 11,
    color: { argb: "FF000000" },
    name: "Times New Roman",
  }
  const subFont: Partial<ExcelJS.Font> = {
    italic: true,
    size: 9,
    color: { argb: "FF000000" },
    name: "Times New Roman",
  }

  // Header A: License Number
  row2.getCell(1).value = {
    richText: [
      { font: headerFont, text: "Real Estate License Number" },
      { font: { ...headerFont, size: 12 }, text: " \n" },
      {
        font: subFont,
        text: "No leading zeros, no spaces.\n(S.12345, BS.678910)\nNo suffix (Corp or LLC)                    ",
      },
    ],
  }

  // Header B: Last Name
  row2.getCell(2).value = {
    richText: [
      { font: headerFont, text: "Student's Last Name Only" },
      { font: { ...headerFont, size: 12 }, text: "\n" },
      {
        font: subFont,
        text: "As it appears on License Lookup\n(McDonald vs. Mc Donald\n or Jones-Smith vs. Jones Smith)\nNo suffix (Jr., Sr., II) ",
      },
    ],
  }

  // Header C: Course Number
  row2.getCell(3).value = {
    richText: [
      { font: headerFont, text: "Course Number" },
      { font: { ...headerFont, size: 12 }, text: "\n " },
      {
        font: subFont,
        text: "Enter full course number,     for each student on roster.     No spaces (CE.0123456-RE) or (POST.01234-RE)",
      },
    ],
  }

  // Header D: Date Completed
  row2.getCell(4).value = {
    richText: [
      { font: headerFont, text: "Date Course Completed " },
      { font: { ...headerFont, size: 12 }, text: "\n" },
      {
        font: subFont,
        text: "Enter date course completed for each student on roster (MM/DD/YYYY) \nExample: (02/05/2014)",
      },
    ],
  }

  // Set header row height and alignment
  row2.height = 80
  for (let col = 1; col <= 4; col++) {
    const cell = row2.getCell(col)
    cell.alignment = { vertical: "top", wrapText: true }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    }
  }
  row2.commit()

  // Data rows starting at row 3
  const dataFont: Partial<ExcelJS.Font> = {
    size: 11,
    name: "Times New Roman",
    color: { argb: "FF000000" },
  }

  let dataRowIndex = 3
  for (const attendee of eligibleAttendees) {
    // Normalize license number
    const licenseResult = normalizeLicenseNumber(attendee.license_number)
    const nameResult = normalizeLastName(attendee.last_name)

    // Track validation issues
    for (const issue of licenseResult.issues) {
      validationIssues.push({
        attendeeId: attendee.id,
        attendeeName: `${attendee.first_name} ${attendee.last_name}`,
        licenseNumber: attendee.license_number,
        field: "license_number",
        issue,
        severity: licenseResult.normalized ? "warning" : "error",
      })
    }

    for (const issue of nameResult.issues) {
      validationIssues.push({
        attendeeId: attendee.id,
        attendeeName: `${attendee.first_name} ${attendee.last_name}`,
        licenseNumber: attendee.license_number,
        field: "last_name",
        issue,
        severity: nameResult.normalized ? "warning" : "error",
      })
    }

    // Skip rows with fatal validation errors
    if (!licenseResult.normalized || !nameResult.normalized) {
      skippedCount++
      continue
    }

    const dataRow = worksheet.getRow(dataRowIndex)

    // Column A: License Number (as text, not number)
    const cellA = dataRow.getCell(1)
    cellA.value = licenseResult.normalized
    cellA.font = dataFont
    cellA.numFmt = "@" // Force text format

    // Column B: Last Name (uppercase)
    const cellB = dataRow.getCell(2)
    cellB.value = nameResult.normalized
    cellB.font = dataFont
    cellB.numFmt = "@"

    // Column C: Course Number
    const cellC = dataRow.getCell(3)
    cellC.value = courseNumber
    cellC.font = dataFont
    cellC.numFmt = "@"

    // Column D: Date (as text in MM/DD/YYYY format — NOT as Excel date)
    // NRED expects MM/DD/YYYY text, not a serialized date value
    const cellD = dataRow.getCell(4)
    cellD.value = formattedDate
    cellD.font = dataFont
    cellD.numFmt = "@"

    dataRow.commit()
    dataRowIndex++
  }

  // Generate buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer)

  // Build filename
  const dateStr = format(parsedDate, "yyyy-MM-dd")
  const filename = `${dateStr} Form 785a(Roster).xlsx`

  return {
    buffer,
    filename,
    rowCount: dataRowIndex - 3,
    validationIssues,
    skippedCount,
  }
}
