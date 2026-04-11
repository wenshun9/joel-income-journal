import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: React.ReactNode
}

export function Card({ children, className, title, subtitle, action }: CardProps) {
  return (
    <div className={cn('bg-[#111827] border border-[#1f2937] rounded-xl', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
          <div>
            {title && <h3 className="font-semibold text-white text-sm">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: 'green' | 'red' | 'blue' | 'gold' | 'white'
  icon?: React.ReactNode
}

export function StatCard({ label, value, sub, color = 'white', icon }: StatCardProps) {
  const colorMap = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    gold: 'text-yellow-400',
    white: 'text-white',
  }
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        {icon && <div className="text-gray-600">{icon}</div>}
      </div>
      <p className={cn('text-2xl font-bold mt-2 font-mono', colorMap[color])}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}
