"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeLicenseNumber } from "@/lib/registration/license"
import { generateCertificate } from "@/lib/certificate/generate"
import { sendCertificateEmail } from "@/lib/cascade/email"
import { queueAlumniSync } from "@/lib/flodesk/alumni"
import { redirect } from "next/navigation"
import { z } from "zod"

const RATING_VALUES = ["excellent", "average", "not_acceptable"] as const

const EvalSchema = z.object({
  session_id: z.string().uuid("Invalid session"),
  license_number: z
    .string()
    .min(1, "License number is required")
    .regex(
      /^(S|BS|B|PM|PB)\.\d{1,7}$/,
      "Invalid format. Use prefix.numbers (e.g., S.1234567)"
    ),
  // INSTRUCTOR ratings — column names match ce_evaluations table exactly
  instructor_knowledge: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  instructor_questions_examples: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  instructor_presented_topics: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  instructor_timely: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  instructor_control_disruptions: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  // CONTENT/MATERIALS ratings — column names match ce_evaluations table exactly
  content_objectives: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  content_organization: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  content_practical_value: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  content_resource_value: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  content_current: z.enum(RATING_VALUES, {
    error: "Rating required",
  }),
  // Comments — column names match ce_evaluations table exactly
  comments_not_acceptable: z.string().optional(),
  additional_comments: z.string().optional(),
})

export type EvalState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  notCheckedIn?: boolean
  alreadyEvaluated?: boolean
  attendeeName?: string
}

export async function submitEvaluation(
  _prevState: EvalState,
  formData: FormData
): Promise<EvalState> {
  const raw = {
    session_id: formData.get("session_id") as string,
    license_number: normalizeLicenseNumber(
      (formData.get("license_number") as string) ?? ""
    ),
    instructor_knowledge: formData.get("instructor_knowledge") as string,
    instructor_questions_examples: formData.get("instructor_questions_examples") as string,
    instructor_presented_topics: formData.get("instructor_presented_topics") as string,
    instructor_timely: formData.get("instructor_timely") as string,
    instructor_control_disruptions: formData.get("instructor_control_disruptions") as string,
    content_objectives: formData.get("content_objectives") as string,
    content_organization: formData.get("content_organization") as string,
    content_practical_value: formData.get("content_practical_value") as string,
    content_resource_value: formData.get("content_resource_value") as string,
    content_current: formData.get("content_current") as string,
    comments_not_acceptable:
      (formData.get("comments_not_acceptable") as string) || undefined,
    additional_comments:
      (formData.get("additional_comments") as string) || undefined,
  }

  const result = EvalSchema.safeParse(raw)
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    const firstError = Object.values(fieldErrors).flat()[0]
    return {
      error: firstError || "Please complete all required fields.",
      fieldErrors: fieldErrors as Record<string, string[]>,
    }
  }

  const data = result.data
  const admin = createAdminClient()

  // Verify session exists — instructor and sponsor come from ce_courses
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, status, location_name, ce_courses(title, course_number, credit_hours, instructor, sponsor)"
    )
    .eq("id", data.session_id)
    .single()

  if (sessionError || !session) {
    return { error: "Session not found." }
  }

  if (session.status === "draft" || session.status === "cancelled") {
    return { error: "This session is not accepting evaluations." }
  }

  // GATE CHECK: Look up attendee and verify checked_in status
  const { data: attendee, error: attendeeError } = await admin
    .from("ce_attendees")
    .select("id, first_name, last_name, email, status, license_number")
    .eq("session_id", data.session_id)
    .eq("license_number", data.license_number)
    .single()

  if (attendeeError || !attendee) {
    return {
      notCheckedIn: true,
      error: `License ${data.license_number} is not registered for this class.`,
    }
  }

  // Must be checked_in (not just registered)
  if (attendee.status === "registered") {
    return {
      notCheckedIn: true,
      error: "You must check in before completing the evaluation.",
    }
  }

  // Already evaluated or certified
  if (attendee.status === "evaluated" || attendee.status === "certified") {
    return {
      alreadyEvaluated: true,
      attendeeName: `${attendee.first_name} ${attendee.last_name}`,
    }
  }

  // Insert evaluation record — individual columns matching ce_evaluations schema
  const { error: evalInsertError } = await admin
    .from("ce_evaluations")
    .insert({
      session_id: data.session_id,
      attendee_id: attendee.id,
      instructor_knowledge: data.instructor_knowledge,
      instructor_questions_examples: data.instructor_questions_examples,
      instructor_presented_topics: data.instructor_presented_topics,
      instructor_timely: data.instructor_timely,
      instructor_control_disruptions: data.instructor_control_disruptions,
      content_objectives: data.content_objectives,
      content_organization: data.content_organization,
      content_practical_value: data.content_practical_value,
      content_resource_value: data.content_resource_value,
      content_current: data.content_current,
      comments_not_acceptable: data.comments_not_acceptable || null,
      additional_comments: data.additional_comments || null,
    })

  if (evalInsertError) {
    // Duplicate evaluation (unique constraint)
    if (
      evalInsertError.code === "23505" ||
      evalInsertError.message?.includes("duplicate")
    ) {
      return {
        alreadyEvaluated: true,
        attendeeName: `${attendee.first_name} ${attendee.last_name}`,
      }
    }
    console.error("Evaluation insert failed:", evalInsertError)
    return { error: "Evaluation submission failed. Please try again." }
  }

  // Update attendee status to evaluated
  await admin
    .from("ce_attendees")
    .update({
      status: "evaluated",
      evaluated_at: new Date().toISOString(),
    })
    .eq("id", attendee.id)

  // Increment evaluated_count on session
  try {
    await admin.rpc("increment_evaluated_count", {
      p_session_id: data.session_id,
    })
  } catch {
    // Fallback: manual increment
    try {
      const { data: currentSession } = await admin
        .from("ce_sessions")
        .select("evaluated_count")
        .eq("id", data.session_id)
        .single()
      if (currentSession) {
        await admin
          .from("ce_sessions")
          .update({
            evaluated_count: (currentSession.evaluated_count || 0) + 1,
          })
          .eq("id", data.session_id)
      }
    } catch (countErr) {
      console.error("Failed to increment evaluated_count:", countErr)
    }
  }

  // TRIGGER CERTIFICATE PIPELINE (non-blocking for eval success)
  // Even if cert generation fails, evaluation is complete
  const courses = session.ce_courses as unknown as
    | { title: string; course_number: string; credit_hours: number; instructor: string; sponsor: string }
    | { title: string; course_number: string; credit_hours: number; instructor: string; sponsor: string }[]
    | null
  const course = Array.isArray(courses) ? courses[0] : courses

  try {
    const certResult = await generateCertificate({
      sessionId: data.session_id,
      attendeeId: attendee.id,
      attendeeName: `${attendee.first_name} ${attendee.last_name}`,
      licenseNumber: attendee.license_number,
      courseTitle: course?.title || "CE Class",
      // TODO: customize for your school/state — set your real state-approved course number(s); this fallback is a placeholder.
      courseNumber: course?.course_number || "CE.0000000-RE",
      creditHours: String(course?.credit_hours || 3),
      sessionDate: session.session_date,
      sponsor: course?.sponsor || "Acme Staging Co.",
      instructor: course?.instructor || "Your Name",
    })

    if (certResult.pdfUrl) {
      // Send certificate email
      const emailResult = await sendCertificateEmail({
        sessionId: data.session_id,
        attendeeEmail: attendee.email,
        attendeeName: `${attendee.first_name} ${attendee.last_name}`,
        courseTitle: course?.title || "CE Class",
        courseNumber: course?.course_number || "CE.0000000-RE",
        creditHours: String(course?.credit_hours || 3),
        sessionDate: session.session_date,
        pdfUrl: certResult.pdfUrl,
      })

      if (emailResult.success) {
        // Update attendee to certified
        await admin
          .from("ce_attendees")
          .update({
            status: "certified",
            certified_at: new Date().toISOString(),
          })
          .eq("id", attendee.id)

        // Update certificate delivery status
        await admin
          .from("ce_certificates")
          .update({
            delivery_status: "sent",
            delivered_at: new Date().toISOString(),
          })
          .eq("attendee_id", attendee.id)
          .eq("session_id", data.session_id)

        // Queue for Flodesk alumni segment (non-blocking)
        queueAlumniSync({
          sessionId: data.session_id,
          attendeeId: attendee.id,
          email: attendee.email,
          firstName: attendee.first_name,
          lastName: attendee.last_name,
          licenseNumber: attendee.license_number,
          courseTitle: course?.title || "CE Class",
          courseNumber: course?.course_number || "CE.0000000-RE",
          sessionDate: session.session_date,
          locationName: (session as any).location_name || "",
        }).catch(() => {}) // swallow — never block eval
      } else {
        // Email failed — alert but don't block
        await admin
          .from("ce_certificates")
          .update({
            delivery_status: "failed",
            delivery_error: emailResult.error || "Unknown email error",
          })
          .eq("attendee_id", attendee.id)
          .eq("session_id", data.session_id)
      }
    }
  } catch (certError: any) {
    // Certificate generation failed — log but don't block eval
    console.error("Certificate pipeline failed:", certError)
  }

  redirect(
    `/form/eval/${data.session_id}/success?name=${encodeURIComponent(attendee.first_name + " " + attendee.last_name)}&email=${encodeURIComponent(attendee.email)}`
  )
}
