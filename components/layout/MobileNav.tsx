'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, DollarSign, BarChart2, FileText, History, Upload, Award } from 'lucide-react'

const navItems = [
  { href: '/',            label: 'Home',     icon: LayoutDashboard },
  { href: '/history',     label: 'History',  icon: History },
  { href: '/holdings',    label: 'Holdings', icon: TrendingUp },
  { href: '/performance', label: 'Returns',  icon: Award },
  { href: '/dividends',   label: 'Dividends',icon: DollarSign },
  { href: '/options',     label: 'Options',  icon: BarChart2 },
  { href: '/upload',      label: 'Upload',   icon: Upload },
]

export default function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-[#1f2937] z-50 flex overflow-x-auto">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 px-3 py-2 flex-1 min-w-[56px] text-center transition-colors ${
              active ? 'text-blue-400' : 'text-gray-500'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] leading-tight">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
