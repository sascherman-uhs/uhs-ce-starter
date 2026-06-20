import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables for admin client')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // The admin (service-role) client is used in Server Components for
      // dynamic data reads. Next.js caches fetches in its Data Cache by URL,
      // which made the paid-registration success page serve a stale pre-webhook
      // empty read forever. Force every admin request to be uncached so reads
      // always reflect current DB state. (force-dynamic on the page alone does
      // NOT cover supabase-js's fetch.)
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  })
}
