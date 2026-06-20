import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import { format, parse } from "date-fns"

// ============================================================
// 612C Evaluation Summary Generator — NRED Division Compliance
// ============================================================
// Generates a PDF matching the official NRED Form 612C layout.
// Must be emailed to eval-filing@your-state.gov as PDF attachment.
//
// Layout mirrors the form exactly:
//   - Header: NEVADA REAL ESTATE DIVISION
//   - Checkbox: Continuing Education (checked)
//   - Course info: title, CE/POST #, hours, date, sponsor, instructor
//   - Counts: licensed attendees, evaluations on file
//   - Section I: INSTRUCTOR (5 categories, Excellent/Average/Not Acceptable)
//   - Section II: CONTENT/MATERIALS (5 categories, same rating columns)
//   - Comments: verbatim "Not Acceptable" comments
//   - Footer with form date and page number
// ============================================================

/** The 10 evaluation categories in order, matching NRED 612C */
const INSTRUCTOR_CATEGORIES = [
  { key: "instructor_knowledge", label: "Knowledge of course content" },
  {
    key: "instructor_questions_examples",
    label: "Questions answered/Examples used",
  },
  {
    key: "instructor_presented_topics",
    label: "Presented all topics on outline",
  },
  { key: "instructor_timely", label: "Timely start and finish of class" },
  {
    key: "instructor_control_disruptions",
    label: "Ability to control disruptions",
  },
] as const

const CONTENT_CATEGORIES = [
  { key: "content_objectives", label: "Course objectives/outcomes" },
  { key: "content_organization", label: "Organization of materials" },
  { key: "content_practical_value", label: "Practical value of content" },
  { key: "content_resource_value", label: "Value of resource materials*" },
  { key: "content_current", label: "Content and materials current" },
] as const

const ALL_CATEGORIES = [...INSTRUCTOR_CATEGORIES, ...CONTENT_CATEGORIES]

type Rating = "excellent" | "average" | "not_acceptable"

export type EvaluationRecord = {
  id: string
  attendee_id: string
  instructor_knowledge: Rating
  instructor_questions_examples: Rating
  instructor_presented_topics: Rating
  instructor_timely: Rating
  instructor_control_disruptions: Rating
  content_objectives: Rating
  content_organization: Rating
  content_practical_value: Rating
  content_resource_value: Rating
  content_current: Rating
  comments_not_acceptable: string | null
  additional_comments: string | null
}

export type EvalSummaryInput = {
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string // YYYY-MM-DD
  sponsor: string
  instructor: string
  licensedAttendeeCount: number
  evaluations: EvaluationRecord[]
}

type CategoryTally = {
  excellent: number
  average: number
  not_acceptable: number
}

export type EvalSummaryResult = {
  buffer: Buffer
  filename: string
  tallies: Record<string, CategoryTally>
  commentsList: string[]
  validationIssues: string[]
}

/**
 * Tally evaluation responses across all 10 categories.
 * Validates that each category sums to the total evaluation count.
 */
function tallyEvaluations(evaluations: EvaluationRecord[]): {
  tallies: Record<string, CategoryTally>
  validationIssues: string[]
} {
  const tallies: Record<string, CategoryTally> = {}
  const validationIssues: string[] = []
  const totalEvals = evaluations.length

  for (const cat of ALL_CATEGORIES) {
    const tally: CategoryTally = { excellent: 0, average: 0, not_acceptable: 0 }

    for (const evalRecord of evaluations) {
      const raw = evalRecord[cat.key as keyof EvaluationRecord] as string
      const rating = raw?.toLowerCase().replace(/\s+/g, "_") as Rating
      if (rating === "excellent") tally.excellent++
      else if (rating === "average") tally.average++
      else if (rating === "not_acceptable") tally.not_acceptable++
    }

    // Validation: tallies must sum to total evaluations
    const sum = tally.excellent + tally.average + tally.not_acceptable
    if (sum !== totalEvals) {
      validationIssues.push(
        `Category "${cat.label}" tallies sum to ${sum}, expected ${totalEvals}`
      )
    }

    tallies[cat.key] = tally
  }

  return { tallies, validationIssues }
}

/**
 * Extract all "Not Acceptable" comments verbatim.
 * Per NRED: "Provide licensee comments exactly as on evaluation forms."
 */
function extractComments(evaluations: EvaluationRecord[]): string[] {
  const comments: string[] = []

  for (const evalRecord of evaluations) {
    // Include not-acceptable comments verbatim
    if (evalRecord.comments_not_acceptable?.trim()) {
      comments.push(evalRecord.comments_not_acceptable.trim())
    }
    // Also include additional comments that may relate to issues
    if (evalRecord.additional_comments?.trim()) {
      comments.push(evalRecord.additional_comments.trim())
    }
  }

  return comments
}

// ============================================================
// PDF Styles — matching NRED 612C form layout
// ============================================================

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  // Header
  headerBlock: {
    alignItems: "center",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 2,
  },
  headerAddress: {
    fontSize: 8,
    color: "#333333",
    textAlign: "center",
    marginBottom: 1,
  },
  formTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  // Checkbox row
  checkboxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 30,
    marginBottom: 10,
  },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checkbox: {
    width: 10,
    height: 10,
    border: "1px solid #000000",
  },
  checkboxChecked: {
    width: 10,
    height: 10,
    border: "1px solid #000000",
    backgroundColor: "#000000",
  },
  checkboxLabel: {
    fontSize: 9,
  },
  // Info grid
  infoRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    width: 80,
  },
  infoValue: {
    fontSize: 9,
    flex: 1,
    borderBottom: "1px solid #cccccc",
    paddingBottom: 1,
  },
  infoLabelRight: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    width: 80,
    marginLeft: 20,
  },
  infoValueRight: {
    fontSize: 9,
    flex: 1,
    borderBottom: "1px solid #cccccc",
    paddingBottom: 1,
  },
  // Counts row
  countsRow: {
    flexDirection: "row",
    marginTop: 6,
    marginBottom: 10,
  },
  countLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  countValue: {
    fontSize: 9,
    marginLeft: 4,
    borderBottom: "1px solid #cccccc",
    paddingHorizontal: 8,
  },
  // Section headers
  sectionHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textDecoration: "underline",
    marginTop: 8,
    marginBottom: 4,
  },
  // Rating table
  ratingTableHeader: {
    flexDirection: "row",
    marginBottom: 2,
    paddingBottom: 2,
    borderBottom: "1px solid #000000",
  },
  ratingCategoryHeader: {
    width: 230,
    fontSize: 9,
  },
  ratingColHeader: {
    width: 80,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  ratingRow: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "center",
  },
  ratingCategory: {
    width: 230,
    fontSize: 9,
  },
  ratingValue: {
    width: 80,
    fontSize: 9,
    textAlign: "center",
    borderBottom: "1px solid #cccccc",
  },
  // Comments
  commentsHeader: {
    fontSize: 9,
    marginTop: 12,
    marginBottom: 6,
  },
  commentLine: {
    flexDirection: "row",
    marginBottom: 4,
    minHeight: 14,
  },
  commentNumber: {
    fontSize: 9,
    width: 20,
  },
  commentText: {
    fontSize: 9,
    flex: 1,
    borderBottom: "1px solid #cccccc",
    paddingBottom: 1,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#666666",
  },
  footnote: {
    fontSize: 7,
    color: "#666666",
    marginTop: 16,
  },
})

// ============================================================
// PDF Document Component
// ============================================================

function Eval612CDocument(props: {
  input: EvalSummaryInput
  tallies: Record<string, CategoryTally>
  comments: string[]
}) {
  const { input, tallies, comments } = props

  const formattedDate = (() => {
    try {
      const d = parse(input.sessionDate, "yyyy-MM-dd", new Date())
      return format(d, "MM/dd/yyyy")
    } catch {
      return input.sessionDate
    }
  })()

  const evalCount = input.evaluations.length

  // Ensure we show at least 12 comment lines (matching the form)
  const commentLines: string[] = []
  if (comments.length === 0) {
    commentLines.push("NONE - NA")
  } else {
    commentLines.push(...comments)
  }
  // Pad to 12 minimum
  while (commentLines.length < 12) {
    commentLines.push("")
  }

  const h = React.createElement

  return h(
    Document,
    null,
    h(
      Page,
      { size: "LETTER", style: styles.page },

      // Header
      h(
        View,
        { style: styles.headerBlock },
        h(Text, { style: styles.headerTitle }, "[YOUR STATE REAL ESTATE REGULATOR]"),
        h(
          Text,
          { style: styles.headerAddress },
          // TODO: customize for your state — replace with YOUR regulator's office address
          "[Regulator Office Address]"
        ),
        h(
          Text,
          { style: styles.headerAddress },
          "[Regulator Phone] * [regulator-website]"
        )
      ),

      // Form Title
      h(
        Text,
        { style: styles.formTitle },
        "CLASSROOM CONTENT AND INSTRUCTOR EVALUATION SUMMARY"
      ),

      // Checkboxes
      h(
        View,
        { style: styles.checkboxRow },
        h(
          View,
          { style: styles.checkboxItem },
          h(View, { style: styles.checkbox }),
          h(Text, { style: styles.checkboxLabel }, "POSTLICENSING EDUCATION")
        ),
        h(
          View,
          { style: styles.checkboxItem },
          h(View, { style: styles.checkboxChecked }),
          h(Text, { style: styles.checkboxLabel }, "CONTINUING EDUCATION"),
          h(Text, { style: { fontSize: 8, color: "#666" } }, " (check relevant box)")
        )
      ),

      // Course Info Rows
      h(
        View,
        { style: styles.infoRow },
        h(Text, { style: styles.infoLabel }, "COURSE TITLE:"),
        h(
          Text,
          { style: styles.infoValue },
          input.courseTitle.toUpperCase()
        )
      ),
      h(
        View,
        { style: styles.infoRow },
        h(Text, { style: styles.infoLabel }, "CE/POST #:"),
        h(Text, { style: styles.infoValue }, input.courseNumber),
        h(Text, { style: styles.infoLabelRight }, "HOURS:"),
        h(Text, { style: styles.infoValueRight }, input.creditHours),
        h(Text, { style: styles.infoLabelRight }, "DATE:"),
        h(Text, { style: styles.infoValueRight }, formattedDate)
      ),
      h(
        View,
        { style: styles.infoRow },
        h(Text, { style: styles.infoLabel }, "SPONSOR:"),
        h(Text, { style: styles.infoValue }, input.sponsor.toUpperCase()),
        h(Text, { style: styles.infoLabelRight }, "INSTRUCTOR:"),
        h(Text, { style: styles.infoValueRight }, input.instructor.toUpperCase())
      ),

      // Counts
      h(
        View,
        { style: styles.countsRow },
        h(
          Text,
          { style: styles.countLabel },
          "NUMBER OF LICENSED ATTENDEES:"
        ),
        h(
          Text,
          { style: styles.countValue },
          String(input.licensedAttendeeCount)
        ),
        h(
          Text,
          { style: { ...styles.countLabel, marginLeft: 30 } },
          "NUMBER OF EVALUATIONS ON FILE:"
        ),
        h(Text, { style: styles.countValue }, String(evalCount))
      ),

      // Section I: INSTRUCTOR
      h(
        Text,
        { style: styles.sectionHeader },
        "I.    INSTRUCTOR:"
      ),
      // Column headers
      h(
        View,
        { style: styles.ratingTableHeader },
        h(Text, { style: styles.ratingCategoryHeader }, ""),
        h(Text, { style: styles.ratingColHeader }, "Excellent"),
        h(Text, { style: styles.ratingColHeader }, "Average"),
        h(Text, { style: styles.ratingColHeader }, "Not Acceptable")
      ),
      // Instructor rows
      ...INSTRUCTOR_CATEGORIES.map((cat) => {
        const t = tallies[cat.key] || { excellent: 0, average: 0, not_acceptable: 0 }
        return h(
          View,
          { style: styles.ratingRow, key: cat.key },
          h(Text, { style: styles.ratingCategory }, cat.label),
          h(Text, { style: styles.ratingValue }, String(t.excellent)),
          h(Text, { style: styles.ratingValue }, String(t.average)),
          h(Text, { style: styles.ratingValue }, String(t.not_acceptable))
        )
      }),

      // Section II: CONTENT/MATERIALS
      h(
        Text,
        { style: styles.sectionHeader },
        "II.   CONTENT/MATERIALS:"
      ),
      // Content rows
      ...CONTENT_CATEGORIES.map((cat) => {
        const t = tallies[cat.key] || { excellent: 0, average: 0, not_acceptable: 0 }
        return h(
          View,
          { style: styles.ratingRow, key: cat.key },
          h(Text, { style: styles.ratingCategory }, cat.label),
          h(Text, { style: styles.ratingValue }, String(t.excellent)),
          h(Text, { style: styles.ratingValue }, String(t.average)),
          h(Text, { style: styles.ratingValue }, String(t.not_acceptable))
        )
      }),

      // Comments section
      h(
        Text,
        { style: styles.commentsHeader },
        'Comments about "Not Acceptable" ratings, instructor, and course content: Provide licensee comments exactly as on evaluation forms.'
      ),
      ...commentLines.map((comment, idx) =>
        h(
          View,
          { style: styles.commentLine, key: `comment-${idx}` },
          h(Text, { style: styles.commentNumber }, `${idx + 1}.`),
          h(Text, { style: styles.commentText }, comment)
        )
      ),

      // Footnote
      h(
        Text,
        { style: styles.footnote },
        "* Any supplemental/additional information such as useful websites, case studies, articles from publications, etc."
      ),
      h(
        Text,
        { style: { ...styles.footnote, marginTop: 4 } },
        "NOTE: Email evaluation summary to eval-filing@your-state.gov."
      ),

      // Footer
      h(
        View,
        { style: styles.footer },
        h(Text, null, "07/13/17"),
        h(Text, null, "Page 1 of 1"),
        h(Text, null, "612C")
      )
    )
  )
}

/**
 * Generate a 612C evaluation summary PDF for a session.
 */
export async function generate612cSummary(
  input: EvalSummaryInput
): Promise<EvalSummaryResult> {
  // Tally all ratings
  const { tallies, validationIssues } = tallyEvaluations(input.evaluations)

  // Extract comments verbatim
  const commentsList = extractComments(input.evaluations)

  // Additional validation
  if (input.licensedAttendeeCount < input.evaluations.length) {
    validationIssues.push(
      `Evaluation count (${input.evaluations.length}) exceeds licensed attendee count (${input.licensedAttendeeCount})`
    )
  }

  // Render PDF
  const pdfBuffer = await renderToBuffer(
    React.createElement(Eval612CDocument, {
      input,
      tallies,
      comments: commentsList,
    }) as any
  )

  const buffer = Buffer.from(pdfBuffer)

  // Build filename
  const parsedDate = parse(input.sessionDate, "yyyy-MM-dd", new Date())
  const dateStr = format(parsedDate, "yyyy-MM-dd")
  const filename = `${dateStr} Form 612C(Eval Summary).pdf`

  return {
    buffer,
    filename,
    tallies,
    commentsList,
    validationIssues,
  }
}
