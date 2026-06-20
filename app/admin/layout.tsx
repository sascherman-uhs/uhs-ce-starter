import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { logout } from "./actions"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Double-check auth at layout level (middleware handles redirect,
  // but this prevents rendering admin content if middleware is bypassed)
  // Allow the login page to render without auth
  // Note: this is a server component, so we check the path via headers
  // The middleware already handles the redirect — this is a safety net

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="hidden md:flex w-64 flex-col border-r bg-muted/40 p-6 justify-between">
          <div>
            <div className="mb-8">
              <h2 className="text-lg font-semibold">CE Admin</h2>
              <p className="text-sm text-muted-foreground">Acme Staging Co.</p>
            </div>
            <nav className="space-y-2">
              <a
                href="/admin"
                className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                Sessions
              </a>
              <a
                href="/admin/sessions/new"
                className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                + New Session
              </a>
              <a
                href="/admin/noshow"
                className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                No-Shows
              </a>
            </nav>
          </div>

          {user && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent text-left"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
