import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' | 'purple'
  size?: 'sm' | 'md'
}

export function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  const variants = {
    green:  'bg-green-400/10 text-green-400 border border-green-400/20',
    red:    'bg-red-400/10 text-red-400 border border-red-400/20',
    blue:   'bg-blue-400/10 text-blue-400 border border-blue-400/20',
    yellow: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
    gray:   'bg-gray-400/10 text-gray-400 border border-gray-400/20',
    purple: 'bg-purple-400/10 text-purple-400 border border-purple-400/20',
  }
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm' }

  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', variants[variant], sizes[size])}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    open:     { label: 'Open',     variant: 'blue' },
    closed:   { label: 'Closed',   variant: 'gray' },
    expired:  { label: 'Expired',  variant: 'yellow' },
    assigned: { label: 'Assigned', variant: 'red' },
  }
  const { label, variant } = map[status] || { label: status, variant: 'gray' }
  return <Badge variant={variant}>{label}</Badge>
}

export function TradeTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    CSP:        { label: 'CSP',         variant: 'green' },
    CoveredCall:{ label: 'Cov. Call',   variant: 'blue' },
    PutSpread:  { label: 'Put Spread',  variant: 'purple' },
    CallSpread: { label: 'Call Spread', variant: 'yellow' },
    LEAPS:      { label: 'LEAPS Call',  variant: 'red' },
  }
  const { label, variant } = map[type] || { label: type, variant: 'gray' }
  return <Badge variant={variant}>{label}</Badge>
}
