'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, DollarSign, BarChart2,
  FileText, FileEdit, Upload, BookOpen, History, Award, LogOut
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-client'

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID

const baseNavItems = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/history',      label: 'History',      icon: History },
  { href: '/holdings',     label: 'Holdings',     icon: TrendingUp },
  { href: '/performance',  label: 'Total Return', icon: Award },
  { href: '/dividends',    label: 'Dividends',    icon: DollarSign },
  { href: '/options',      label: 'Options',      icon: BarChart2 },
  { href: '/report',       label: 'Report',       icon: FileText },
  { href: '/upload',       label: 'Upload Data',  icon: Upload },
]

const adminNavItems = [
  { href: '/script', label: 'Script', icon: FileEdit },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [email, setEmail]   = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const isAdmin = !!ADMIN_USER_ID && userId === ADMIN_USER_ID
  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-64 bg-[#111827] border-r border-[#1f2937] z-40">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[#1f2937]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-white leading-tight">Joel Income</div>
            <div className="text-xs text-gray-400">Journal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer — user + sign out */}
      <div className="px-4 py-4 border-t border-[#1f2937] space-y-2">
        {email && (
          <p className="text-xs text-gray-500 truncate px-2" title={email}>{email}</p>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
