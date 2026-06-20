import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { fulfillCheckout, reconcileRefund } from '@/lib/stripe/fulfill'

// Per RESEARCH.md "## Webhook Handler / ### Route + runtime":
// Node.js runtime is required so stripe.webhooks.constructEvent (HMAC SHA-256 via node:crypto) works.
// Edge runtime would need constructEventAsync — we stay on Node because the project is Node-only
// (msal-node, nodemailer, imapflow, qrcode buffer paths).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // never cached
export const maxDuration = 30 // Stripe's own webhook timeout

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not set — webhook cannot verify signatures')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await req.text() // App Router: raw body via .text() — NO bodyParser config needed.

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err: any) {
    console.error('Stripe signature verification failed:', err?.message)
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency gate (CONTEXT D-21, RESEARCH.md "Idempotency keyed on event.id").
  const { data: existing } = await admin
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ received: true, deduped: true })
  }

  // Insert the event row early. If processing throws, we still have a record.
  await admin.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event as any,
  })

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await fulfillCheckout(event.data.object as Stripe.Checkout.Session)
        break
      case 'charge.refunded':
        await reconcileRefund(event.data.object as Stripe.Charge)
        break
      default:
        // Unhandled event type — record-and-ignore (already logged in stripe_events).
        break
    }

    await admin
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id)

    return NextResponse.json({ received: true })
  } catch (err: any) {
    // 5xx makes Stripe retry per RESEARCH.md "## Pitfalls — Webhook delivery retries".
    console.error('Webhook processing error:', event.type, err?.message ?? err)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
