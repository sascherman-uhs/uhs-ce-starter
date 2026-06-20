import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the auth session (important for cookie management)
  let {
    data: { user },
  } = await supabase.auth.getUser()

  // [DEV AUTO-LOGIN 2026-04-14] When no session and dev credentials are
  // configured, sign in automatically. Applies only in development; Vercel
  // production has NODE_ENV=production and never sets DEV_USER_* vars, so
  // real users go through the normal login flow unchanged.
  if (
    !user &&
    process.env.NODE_ENV === 'development' &&
    process.env.DEV_USER_EMAIL &&
    process.env.DEV_USER_PASSWORD
  ) {
    await supabase.auth.signInWithPassword({
      email: process.env.DEV_USER_EMAIL,
      password: process.env.DEV_USER_PASSWORD,
    })
    const refreshed = await supabase.auth.getUser()
    user = refreshed.data.user
  }

  // Protect admin routes (except login page)
  if (
    request.nextUrl.pathname.startsWith('/admin') &&
    !request.nextUrl.pathname.startsWith('/admin/login')
  ) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // Redirect root to admin
  if (request.nextUrl.pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/admin', request.url))
    } else {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // Redirect authenticated users away from login
  if (request.nextUrl.pathname === '/admin/login' && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // /form/* routes — no auth check, pass through
  return response
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
  ],
}
