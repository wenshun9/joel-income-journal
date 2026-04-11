import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'

export const metadata: Metadata = {
  title: 'Joel Income Journal',
  description: 'Personal investment income tracker — dividends, options, monthly reports',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0e1a] text-white min-h-screen">
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <Sidebar />
          {/* Main content */}
          <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
              {children}
            </div>
          </main>
        </div>
        {/* Mobile bottom nav */}
        <MobileNav />
      </body>
    </html>
  )
}
