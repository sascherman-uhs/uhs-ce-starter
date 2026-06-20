import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Per Plan 08-05: this endpoint backs the success-page client poll.
// Mirrors the runtime/dynamic pattern from app/api/webhooks/stripe/route.ts —
// we need Node.js (Supabase service-role client) and never cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/payments/status?cs=cs_test_xxx
 *
 * Returns the readiness state of a paid registration keyed by the Stripe
 * Checkout Session id. The success page's <ConfirmingPoll> client island
 * polls this every 2s while waiting for the webhook (Plan 08-02
 * `fulfillCheckout`) to write the `ce_attendees` row.
 *
 * Response:
 *   - 200 { ready: true,  attendee: { first_name, paid_amount_cents } } when found
 *   - 200 { ready: false } when the webhook has not yet written the row
 *   - 400 { ready: false, error } when `cs` is missing or malformed
 *
 * READ-ONLY: this route never writes to ce_attendees. The webhook handler
 * (Plan 08-02) is the sole writer per CONTEXT D-05.
 */
export async function GET(req: NextRequest) {
  const cs = req.nextUrl.searchParams.get("cs")
  if (!cs || !cs.startsWith("cs_")) {
    return NextResponse.json(
      { ready: false, error: "Invalid checkout session id" },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data: attendee } = await admin
    .from("ce_attendees")
    .select("id, first_name, paid_amount_cents")
    .eq("stripe_checkout_session_id", cs)
    .maybeSingle()

  if (attendee) {
    return NextResponse.json({
      ready: true,
      attendee: {
        first_name: attendee.first_name,
        paid_amount_cents: attendee.paid_amount_cents,
      },
    })
  }

  return NextResponse.json({ ready: false })
}
