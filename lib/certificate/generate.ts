import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import { createAdminClient } from "@/lib/supabase/admin"
import { SEAL_DATA_URI } from "./seal"
import { format, parse } from "date-fns"

// ============================================================
// Certificate PDF Generation
// ============================================================
// TODO: customize for your school — this builds the CE certificate PDF (layout,
// wording, fonts, colors, and seal). Replace the seal in lib/certificate/seal.ts,
// adjust the @react-pdf/renderer styles below to match YOUR brand, and confirm
// the certificate language meets YOUR state's CE certificate requirements.
// Generates a branded CE certificate using @react-pdf/renderer.
// Uploads to Supabase Storage and records in ce_certificates table.
// Column names match ce_certificates table schema exactly.
//
// One-page guarantee (NOT font shrinking): the <Page> uses wrap={false}
// to disable pagination, the decorative double-rule border is two
// `position: absolute` + `fixed` frames (zero flow height, cannot
// paginate), and all content lives in a single non-flex content View
// with fixed paddings/margins tuned to fit inside the Letter-landscape
// content box (692x512pt). See the 260610-99k plan diagnosis.
// ============================================================

type CertificateData = {
  sessionId: string
  attendeeId: string
  attendeeName: string
  licenseNumber: string
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string // YYYY-MM-DD
  sponsor: string
  instructor: string
}

// Brand colors — canonical trio + white only.
const NAVY = "#1a1a2e"
const GOLD = "#c9a84c"
const MEDIUM_GRAY = "#666666"

// your org gold seal: imported from ./seal as an embedded base64 data URI so it
// bundles INTO the Vercel serverless function (public/ is CDN-only there).

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 50,
    fontFamily: "Helvetica",
  },
  // Decorative double-rule frame: absolutely positioned + `fixed`, so it
  // is OUTSIDE the flow and contributes zero height — it can never cause
  // a second page. Navy hairline outer + gold hairline inner.
  borderFrameOuter: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    border: `1.5px solid ${NAVY}`,
  },
  borderFrameInner: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    border: `1px solid ${GOLD}`,
  },
  // The ONLY flow child. Pins the page to EXACT LETTER-landscape height:
  // @react-pdf/layout reads a Page's yoga height from node.box (unset on the
  // layout pass) NOT node.style, so a Page's own height is effectively `auto`
  // and the MediaBox grows/shrinks to fit content (the 624.4 / 602.4 drift).
  // Giving this single child a FIXED height === content box (612 page height
  // − 50 top − 50 bottom page padding = 512) makes the page's auto-height
  // resolve to exactly 612. justifyContent centers the existing content
  // vertically inside the fixed box; alignItems keeps it horizontally centered.
  content: {
    height: 512,
    justifyContent: "center",
    paddingHorizontal: 56,
    alignItems: "center",
  },
  headerText: {
    fontSize: 12,
    color: MEDIUM_GRAY,
    letterSpacing: 3,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    color: MEDIUM_GRAY,
    letterSpacing: 2,
    marginBottom: 14,
  },
  divider: {
    width: 100,
    height: 2,
    backgroundColor: GOLD,
    marginBottom: 14,
  },
  certifiesText: {
    fontSize: 11,
    color: MEDIUM_GRAY,
    marginBottom: 8,
  },
  attendeeName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 4,
    textAlign: "center",
  },
  licenseText: {
    fontSize: 10,
    color: MEDIUM_GRAY,
    marginBottom: 12,
  },
  completionText: {
    fontSize: 11,
    color: MEDIUM_GRAY,
    textAlign: "center",
    lineHeight: 1.45,
    marginBottom: 12,
    maxWidth: 400,
  },
  courseTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 4,
    textAlign: "center",
  },
  courseDetail: {
    fontSize: 10,
    color: MEDIUM_GRAY,
    marginBottom: 2,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 30,
    marginTop: 14,
    marginBottom: 14,
  },
  detailItem: {
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 8,
    color: MEDIUM_GRAY,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 10,
    color: NAVY,
    fontFamily: "Helvetica-Bold",
  },
  signatureArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    width: "100%",
    marginTop: 16,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  signatureBlock: {
    alignItems: "center",
    width: 180,
  },
  signatureLine: {
    width: 160,
    height: 1,
    backgroundColor: NAVY,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: MEDIUM_GRAY,
    letterSpacing: 1,
  },
  signatureName: {
    fontSize: 10,
    color: NAVY,
    marginBottom: 4,
  },
  // Gold your org seal — centerpiece of the signing band, between the two
  // signature blocks. ~1in at 72pt; tasteful, not dominating.
  seal: {
    width: 72,
    height: 72,
    marginTop: 14,
    marginBottom: 2,
    objectFit: "contain",
  },
  footer: {
    fontSize: 7,
    color: MEDIUM_GRAY,
    marginTop: 10,
    textAlign: "center",
  },
})

function CertificateDocument(props: CertificateData) {
  const formattedDate = (() => {
    try {
      const d = parse(props.sessionDate, "yyyy-MM-dd", new Date())
      return format(d, "MMMM d, yyyy")
    } catch {
      return props.sessionDate
    }
  })()

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      // size: "LETTER" + orientation: "landscape" resolves to width 792 /
      // height 612 in @react-pdf/layout (PAGE_SIZES.LETTER = [612, 792], then
      // flipped for landscape). The 624.4pt height seen before was NOT a size
      // mis-spec — it was the single wrap={false} page GROWING ~12.4pt to
      // absorb content that overflowed 612. The fix is the tightened content
      // paddings/margins below (so intrinsic height < 612), not the size token.
      { size: "LETTER", orientation: "landscape", wrap: false, style: styles.page },
      // Decorative double-rule frame (absolute + fixed = zero flow height).
      React.createElement(View, { style: styles.borderFrameOuter, fixed: true }),
      React.createElement(View, { style: styles.borderFrameInner, fixed: true }),
      // The single flow child holding all content.
      React.createElement(
        View,
        { style: styles.content, wrap: false },
        React.createElement(
          Text,
          { style: styles.headerText },
          // TODO: customize for your state — header printed at the top of the certificate.
          "[YOUR STATE REAL ESTATE REGULATOR]"
        ),
        React.createElement(
          Text,
          { style: styles.title },
          "Certificate of Completion"
        ),
        React.createElement(
          Text,
          { style: styles.subtitle },
          "CONTINUING EDUCATION"
        ),
        React.createElement(View, { style: styles.divider }),
        React.createElement(
          Text,
          { style: styles.certifiesText },
          "This certifies that"
        ),
        React.createElement(
          Text,
          { style: styles.attendeeName },
          props.attendeeName
        ),
        React.createElement(
          Text,
          { style: styles.licenseText },
          `License: ${props.licenseNumber}`
        ),
        React.createElement(
          Text,
          { style: styles.completionText },
          `has successfully completed the required ${props.creditHours} hours of continuing education in the following course:`
        ),
        React.createElement(
          Text,
          { style: styles.courseTitle },
          props.courseTitle
        ),
        React.createElement(
          Text,
          { style: styles.courseDetail },
          `Course #: ${props.courseNumber}`
        ),
        React.createElement(
          View,
          { style: styles.detailsRow },
          React.createElement(
            View,
            { style: styles.detailItem },
            React.createElement(Text, { style: styles.detailLabel }, "DATE"),
            React.createElement(
              Text,
              { style: styles.detailValue },
              formattedDate
            )
          ),
          React.createElement(
            View,
            { style: styles.detailItem },
            React.createElement(
              Text,
              { style: styles.detailLabel },
              "CREDIT HOURS"
            ),
            React.createElement(
              Text,
              { style: styles.detailValue },
              `${props.creditHours} General`
            )
          ),
          React.createElement(
            View,
            { style: styles.detailItem },
            React.createElement(
              Text,
              { style: styles.detailLabel },
              "SPONSOR"
            ),
            React.createElement(
              Text,
              { style: styles.detailValue },
              props.sponsor
            )
          )
        ),
        React.createElement(
          View,
          { style: styles.signatureArea },
          React.createElement(
            View,
            { style: styles.signatureBlock },
            React.createElement(
              Text,
              { style: styles.signatureName },
              props.instructor
            ),
            React.createElement(View, { style: styles.signatureLine }),
            React.createElement(
              Text,
              { style: styles.signatureLabel },
              "INSTRUCTOR"
            )
          ),
          React.createElement(Image, { src: SEAL_DATA_URI, style: styles.seal }),
          React.createElement(
            View,
            { style: styles.signatureBlock },
            React.createElement(
              Text,
              { style: styles.signatureName },
              props.sponsor
            ),
            React.createElement(View, { style: styles.signatureLine }),
            React.createElement(
              Text,
              { style: styles.signatureLabel },
              "APPROVED SPONSOR"
            )
          )
        ),
        React.createElement(
          Text,
          { style: styles.footer },
          `Certificate ID: ${props.sessionId.slice(0, 8)}-${props.attendeeId.slice(0, 8)}`
        )
      )
    )
  )
}

/**
 * Pure render: builds the certificate document and returns the PDF
 * buffer. NO Supabase, NO storage upload, NO ce_certificates insert.
 * Safe to call from a local verification harness / unit test.
 */
export async function renderCertificatePdf(
  data: CertificateData
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(CertificateDocument, data) as any)
}

/**
 * Generate a branded PDF certificate, upload to Supabase Storage,
 * and record in ce_certificates table.
 *
 * Table columns: id, attendee_id, session_id, attendee_name, license_number,
 * course_title, course_number, credit_hours, session_date, sponsor, instructor,
 * pdf_storage_path, pdf_url, delivery_status, delivered_at, delivery_error, created_at
 */
export async function generateCertificate(
  data: CertificateData
): Promise<{ pdfUrl: string; certificateId?: string }> {
  const admin = createAdminClient()

  // Generate PDF buffer (pure render — no side effects).
  const pdfBuffer = await renderCertificatePdf(data)

  // Upload to Supabase Storage
  const storagePath = `certificates/${data.sessionId}/${data.attendeeId}.pdf`

  const { error: uploadError } = await admin.storage
    .from("ce-assets")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    console.error("Certificate upload failed:", uploadError)
    throw new Error(`Certificate upload failed: ${uploadError.message}`)
  }

  // Get the public URL
  const { data: urlData } = admin.storage
    .from("ce-assets")
    .getPublicUrl(storagePath)

  const pdfUrl = urlData.publicUrl

  // Insert certificate record — flat columns matching ce_certificates schema
  const { data: certRecord, error: certError } = await admin
    .from("ce_certificates")
    .insert({
      session_id: data.sessionId,
      attendee_id: data.attendeeId,
      attendee_name: data.attendeeName,
      license_number: data.licenseNumber,
      course_title: data.courseTitle,
      course_number: data.courseNumber,
      credit_hours: parseFloat(data.creditHours),
      session_date: data.sessionDate,
      sponsor: data.sponsor,
      instructor: data.instructor,
      pdf_storage_path: storagePath,
      pdf_url: pdfUrl,
      delivery_status: "pending",
    })
    .select("id")
    .single()

  if (certError) {
    console.error("Certificate record insert failed:", certError)
    // Don't throw — the PDF was uploaded successfully
  }

  return {
    pdfUrl,
    certificateId: certRecord?.id,
  }
}
