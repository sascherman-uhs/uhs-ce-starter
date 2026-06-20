import { createClient } from "@/lib/supabase/server"
import { SessionForm } from "./session-form"

export default async function NewSessionPage() {
  const supabase = await createClient()

  // Fetch active courses for the dropdown.
  // Phase 8 (D-01): include fee_cents so the schedule form can show the course's
  // current default fee in the helper text under the per-session override input.
  const { data: courses } = await supabase
    .from("ce_courses")
    .select("id, title, course_number, credit_hours, fee_cents")
    .eq("is_active", true)
    .order("title")

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Schedule New Session</h1>
        <p className="text-muted-foreground">
          Create a CE class session. QR codes, flyer, email, and calendar event
          will be generated after creation.
        </p>
      </div>

      <SessionForm courses={courses || []} />
    </div>
  )
}
