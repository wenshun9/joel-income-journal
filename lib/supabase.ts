// Server-only Supabase client — do NOT import in 'use client' components
// For browser components, import from '@/lib/supabase-client' instead
import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use in API route handlers and Server Components only
export function createServerClient() {
  const cookieStore = cookies()
  return _createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll()      { return cookieStore.getAll() },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // In Server Component renders — ignored, middleware handles session refresh
        }
      },
    },
  })
}
