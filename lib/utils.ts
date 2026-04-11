import { format, parse, parseISO, isValid } from 'date-fns'

// ─── Number Formatting ────────────────────────────────────────────────────────

export function formatCurrency(value: number, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPct(value: number, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '0.00%'
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '0'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatShares(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value)
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = parseISO(dateStr)
    if (!isValid(date)) return dateStr
    return format(date, 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function formatMonthLabel(month: string): string {
  // 'YYYY-MM' → 'March 2026'
  try {
    const date = parse(month, 'yyyy-MM', new Date())
    return format(date, 'MMMM yyyy')
  } catch {
    return month
  }
}

export function getCurrentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

export function getPrevMonth(month: string): string {
  try {
    const date = parse(month, 'yyyy-MM', new Date())
    date.setMonth(date.getMonth() - 1)
    return format(date, 'yyyy-MM')
  } catch {
    return month
  }
}

export function dateToMonth(dateStr: string): string {
  try {
    const date = parseISO(dateStr)
    return format(date, 'yyyy-MM')
  } catch {
    return ''
  }
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

export function getPnlColor(value: number): string {
  if (value > 0) return 'text-green-400'
  if (value < 0) return 'text-red-400'
  return 'text-gray-400'
}

export function getPnlBg(value: number): string {
  if (value > 0) return 'bg-green-400/10 text-green-400'
  if (value < 0) return 'bg-red-400/10 text-red-400'
  return 'bg-gray-400/10 text-gray-400'
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

export function parseCSVRow(row: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// ─── Option Symbol Parsing ────────────────────────────────────────────────────

export function parseOptionSymbol(symbol: string): {
  underlying: string
  expiry: string
  strike: number
  optionType: 'P' | 'C'
} | null {
  // e.g. "SOXL 27MAR26 50 P" or "SPXW 18MAR26 6800 C"
  const match = symbol.match(/^(\S+)\s+(\d{2}[A-Z]{3}\d{2})\s+([\d.]+)\s+([PC])$/)
  if (!match) return null
  return {
    underlying: match[1],
    expiry: match[2],
    strike: parseFloat(match[3]),
    optionType: match[4] as 'P' | 'C',
  }
}

export function inferTradeType(symbol: string, quantity: number): string {
  const parsed = parseOptionSymbol(symbol)
  if (!parsed) return 'Unknown'

  const isSpx = parsed.underlying === 'SPXW' || parsed.underlying === 'SPX'

  if (isSpx) {
    return parsed.optionType === 'P' ? 'PutSpread' : 'CallSpread'
  }

  // For non-SPX: negative quantity on open = selling (CSP or CoveredCall)
  if (parsed.optionType === 'P') return 'CSP'
  return 'CoveredCall'
}

// ─── Dividend Frequency ───────────────────────────────────────────────────────

export function inferFrequency(ticker: string, paymentCount: number): 'Weekly' | 'Monthly' | 'Quarterly' | 'Unknown' {
  // Weekly payers tend to have 4-5 payments per month
  if (paymentCount >= 4) return 'Weekly'
  if (paymentCount >= 2) return 'Monthly'
  if (paymentCount === 1) return 'Monthly'
  return 'Unknown'
}

export function calcAnnualisedYield(
  avgMonthlyPerShare: number,
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Unknown',
  currentPrice: number
): number {
  if (!currentPrice || currentPrice === 0) return 0
  let annualPerShare = 0
  if (frequency === 'Weekly') annualPerShare = avgMonthlyPerShare * 52
  else if (frequency === 'Monthly') annualPerShare = avgMonthlyPerShare * 12
  else if (frequency === 'Quarterly') annualPerShare = avgMonthlyPerShare * 4
  else annualPerShare = avgMonthlyPerShare * 12
  return (annualPerShare / currentPrice) * 100
}

// ─── Misc ──────────────────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function applyWHT(gross: number, rate = 0.30): number {
  return gross * (1 - rate)
}

export function calcWHT(gross: number, rate = 0.30): number {
  return gross * rate
}

// Parse "Thu Apr 30 2026 00:00:00 GMT+0800 (Singapore Standard Time)" to ISO date
export function parseSnowballDate(dateStr: string): string {
  if (!dateStr || dateStr === '0') return ''
  try {
    const date = new Date(dateStr)
    if (!isValid(date)) return ''
    return format(date, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}
