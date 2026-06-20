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
import { format, parse } from "date-fns"

// ============================================================
// Flyer PDF Generation
// ============================================================
// TODO: customize for your school — adjust the styles/wording below to match
// YOUR brand. Generates a branded CE class flyer using @react-pdf/renderer
// (an in-process alternative to an external design tool).
// Uploads to Supabase Storage and returns the public URL.
// ============================================================

// TODO: PNG conversion — if email needs a PNG instead of PDF attachment,
// consider using pdf-to-img, pdf2pic, or a serverless conversion step.

type FlyerParams = {
  courseTitle: string
  courseNumber: string
  creditHours: string
  sessionDate: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  locationName: string
  locationAddress?: string
  registrationQrUrl: string
  sessionId: string
}

// Brand colors
const NAVY = "#1a1a2e"
const GOLD = "#c9a84c"
const WHITE = "#ffffff"
const LIGHT_GOLD = "#f5f0e3"
const DARK_GRAY = "#333333"
const MEDIUM_GRAY = "#666666"

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: WHITE,
    fontFamily: "Helvetica",
  },
  // Top banner
  topBanner: {
    backgroundColor: NAVY,
    paddingVertical: 32,
    paddingHorizontal: 50,
    alignItems: "center",
  },
  companyName: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: GOLD,
    letterSpacing: 6,
    marginBottom: 6,
  },
  presentsText: {
    fontSize: 11,
    color: WHITE,
    letterSpacing: 4,
    opacity: 0.8,
  },
  // Gold accent line
  goldLine: {
    height: 4,
    backgroundColor: GOLD,
  },
  // Course title section
  titleSection: {
    paddingHorizontal: 50,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: "center",
  },
  courseTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textAlign: "center",
    lineHeight: 1.3,
    maxWidth: 440,
  },
  // CE badge
  badgeContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    backgroundColor: GOLD,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 1,
  },
  // Approval line
  approvalSection: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  approvalText: {
    fontSize: 10,
    color: MEDIUM_GRAY,
    fontFamily: "Helvetica-Oblique",
  },
  courseNumberText: {
    fontSize: 9,
    color: MEDIUM_GRAY,
    marginTop: 2,
  },
  // Divider
  divider: {
    width: 60,
    height: 2,
    backgroundColor: GOLD,
    alignSelf: "center",
    marginVertical: 16,
  },
  // Details section
  detailsSection: {
    backgroundColor: LIGHT_GOLD,
    marginHorizontal: 50,
    paddingVertical: 24,
    paddingHorizontal: 30,
    borderRadius: 4,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    width: 80,
    letterSpacing: 1,
  },
  detailValue: {
    fontSize: 14,
    color: DARK_GRAY,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  detailSubValue: {
    fontSize: 11,
    color: MEDIUM_GRAY,
    marginTop: 2,
  },
  // QR section
  qrSection: {
    alignItems: "center",
    paddingVertical: 20,
  },
  qrImage: {
    width: 140,
    height: 140,
  },
  scanText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginTop: 10,
    letterSpacing: 1,
  },
  scanSubtext: {
    fontSize: 9,
    color: MEDIUM_GRAY,
    marginTop: 3,
  },
  // Footer
  footer: {
    backgroundColor: NAVY,
    paddingVertical: 18,
    paddingHorizontal: 50,
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginTop: "auto",
  },
  footerText: {
    fontSize: 11,
    color: GOLD,
    letterSpacing: 0.5,
  },
  footerDivider: {
    fontSize: 11,
    color: GOLD,
    opacity: 0.5,
  },
})

function formatTime12h(time24: string): string {
  try {
    const d = parse(time24, "HH:mm", new Date())
    return format(d, "h:mm a")
  } catch {
    return time24
  }
}

function formatDateLong(dateStr: string): string {
  try {
    const d = parse(dateStr, "yyyy-MM-dd", new Date())
    return format(d, "EEEE, MMMM d, yyyy")
  } catch {
    return dateStr
  }
}

/**
 * Fetch QR code image as base64 data URI for embedding in the PDF.
 * @react-pdf/renderer needs either a URL or a buffer/base64 source.
 * We fetch the image and embed it directly to avoid runtime URL fetches.
 */
async function fetchQrAsDataUri(qrUrl: string): Promise<string> {
  const response = await fetch(qrUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch QR image: ${response.status} ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const base64 = buffer.toString("base64")
  return `data:image/png;base64,${base64}`
}

function FlyerDocument(props: FlyerParams & { qrDataUri: string }) {
  const formattedDate = formatDateLong(props.sessionDate)
  const formattedTime = `${formatTime12h(props.startTime)} - ${formatTime12h(props.endTime)}`

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", orientation: "portrait", style: styles.page },

      // Top Navy Banner
      React.createElement(
        View,
        { style: styles.topBanner },
        React.createElement(
          Text,
          { style: styles.companyName },
          "ACME STAGING CO."
        ),
        React.createElement(
          Text,
          { style: styles.presentsText },
          "PRESENTS"
        )
      ),

      // Gold accent line
      React.createElement(View, { style: styles.goldLine }),

      // Course Title
      React.createElement(
        View,
        { style: styles.titleSection },
        React.createElement(
          Text,
          { style: styles.courseTitle },
          props.courseTitle
        )
      ),

      // FREE CE Badge
      React.createElement(
        View,
        { style: styles.badgeContainer },
        React.createElement(
          View,
          { style: styles.badge },
          React.createElement(
            Text,
            { style: styles.badgeText },
            `FREE ${props.creditHours}-Hour CE Course`
          )
        )
      ),

      // Approval line
      React.createElement(
        View,
        { style: styles.approvalSection },
        React.createElement(
          Text,
          { style: styles.approvalText },
          "Approved by [Your State Real Estate Regulator]"
        ),
        React.createElement(
          Text,
          { style: styles.courseNumberText },
          `Course #${props.courseNumber}`
        )
      ),

      // Divider
      React.createElement(View, { style: styles.divider }),

      // Session Details Block
      React.createElement(
        View,
        { style: styles.detailsSection },
        // Date
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "DATE"),
          React.createElement(Text, { style: styles.detailValue }, formattedDate)
        ),
        // Time
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "TIME"),
          React.createElement(Text, { style: styles.detailValue }, formattedTime)
        ),
        // Location
        React.createElement(
          View,
          { style: { ...styles.detailRow, marginBottom: 0 } },
          React.createElement(Text, { style: styles.detailLabel }, "LOCATION"),
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(
              Text,
              { style: styles.detailValue },
              props.locationName
            ),
            props.locationAddress
              ? React.createElement(
                  Text,
                  { style: styles.detailSubValue },
                  props.locationAddress
                )
              : null
          )
        )
      ),

      // QR Code Section
      React.createElement(
        View,
        { style: styles.qrSection },
        React.createElement(Image, {
          style: styles.qrImage,
          src: props.qrDataUri,
        }),
        React.createElement(
          Text,
          { style: styles.scanText },
          "SCAN TO REGISTER"
        ),
        React.createElement(
          Text,
          { style: styles.scanSubtext },
          "Scan QR code to register FREE"
        )
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          Text,
          { style: styles.footerText },
          "hello@example.com"
        ),
        React.createElement(
          Text,
          { style: styles.footerDivider },
          "|"
        ),
        React.createElement(
          Text,
          { style: styles.footerText },
          "555-555-5555"
        )
      )
    )
  )
}

/**
 * Generate a branded flyer PDF, upload to Supabase Storage,
 * and return the public URL.
 *
 * Storage path: ce-assets/flyers/{session_id}/flyer.pdf
 */
export async function generateFlyerPdf(params: FlyerParams): Promise<Buffer> {
  // Fetch the QR code image and embed as data URI
  const qrDataUri = await fetchQrAsDataUri(params.registrationQrUrl)

  // Generate PDF buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    React.createElement(FlyerDocument, { ...params, qrDataUri }) as any
  )

  return Buffer.from(pdfBuffer)
}

/**
 * Generate the flyer PDF and upload to Supabase Storage.
 * Returns the public URL of the uploaded PDF.
 */
export async function generateAndUploadFlyer(
  params: FlyerParams
): Promise<string> {
  const admin = createAdminClient()

  // Generate the PDF
  const pdfBuffer = await generateFlyerPdf(params)

  // Build a human-readable filename
  // e.g. "CE-Class_Apr-21-2026_Example-Brokerage.pdf"
  const dateObj = parse(params.sessionDate, "yyyy-MM-dd", new Date())
  const dateSlug = format(dateObj, "MMM-d-yyyy")
  const courseSlug = params.courseTitle
    .replace(/^FROM LISTED TO SOLD.*$/i, "Listed-to-Sold")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  const locationSlug = params.locationName
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  const filename = `CE-${courseSlug}_${dateSlug}_${locationSlug}.pdf`

  // Upload to Supabase Storage (keep session_id folder for uniqueness)
  const storagePath = `flyers/${params.sessionId}/${filename}`

  const { error: uploadError } = await admin.storage
    .from("ce-assets")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    console.error("Flyer upload failed:", uploadError)
    throw new Error(`Flyer upload failed: ${uploadError.message}`)
  }

  // Get the public URL
  const { data: urlData } = admin.storage
    .from("ce-assets")
    .getPublicUrl(storagePath)

  return urlData.publicUrl
}
