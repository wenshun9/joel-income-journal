import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files and public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/api/prices'         // public Yahoo Finance proxy — no user data
  ) {
    return NextResponse.next()
  }

  // Create a response we can mutate (for cookie refresh)
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()     { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refresh session — MUST use getUser() not getSession() (more secure)
  const { data: { user } } = await supabase.auth.getUser()

  // ── Auth routing ───────────────────────────────────────────────────────────
  const isLoginPath = pathname.startsWith('/login')
  const isAuthPath  = pathname.startsWith('/auth')
  const isApiPath   = pathname.startsWith('/api')

  if (isLoginPath || isAuthPath) {
    // Already logged in → send to dashboard
    if (user) return NextResponse.redirect(new URL('/', request.url))
    return response
  }

  if (!user) {
    // API routes → return 401 JSON (client handles it)
    if (isApiPath) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Page routes → redirect to login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
