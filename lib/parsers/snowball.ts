import { Holding } from '@/types'
import { parseCSVRow, parseSnowballDate } from '@/lib/utils'
import { format } from 'date-fns'

// ─── Snowball CSV Parser ───────────────────────────────────────────────────────
// Handles the export from Snowball Analytics

export interface SnowballParsedData {
  month: string
  holdings: Holding[]
}

function detectBroker(portfolios: string): 'IBKR' | 'Longbridge' | 'Both' {
  const lower = portfolios.toLowerCase()
  const hasIBKR = lower.includes('ibkr')
  const hasLB = lower.includes('long bridge') || lower.includes('longbridge')
  if (hasIBKR && hasLB) return 'Both'
  if (hasLB) return 'Longbridge'
  return 'IBKR'
}

export function parseSnowballCSV(csvContent: string, month?: string): SnowballParsedData {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { month: month || format(new Date(), 'yyyy-MM'), holdings: [] }

  const headers = parseCSVRow(lines[0]).map(h => h.trim().replace(/\r/g, ''))
  const uploadMonth = month || format(new Date(), 'yyyy-MM')

  const holdings: Holding[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i].replace(/\r/g, ''))
    if (row.length < 5) continue

    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? '' })

    const ticker = obj['Holding']?.trim()
    if (!ticker || ticker === 'Holding') continue

    const shares = parseFloat(obj['Shares']) || 0
    if (shares === 0) continue

    const costBasis = parseFloat(obj['Cost basis']) || 0
    const currentValue = parseFloat(obj['Current value']) || 0
    const currentPrice = parseFloat(obj['Share price']) || 0
    const costPerShare = shares > 0 ? costBasis / shares : 0

    const broker = detectBroker(obj['Portfolios'] || '')

    const divYield = parseFloat(obj['Dividend yield']) || 0
    const divYieldOnCost = parseFloat(obj['Dividend yield on cost']) || 0
    const divReceived = parseFloat(obj['Div. received']) || 0
    const taxPaid = parseFloat(obj['Tax']) || 0

    const nextPaymentRaw = obj['Date of the next payment'] || ''
    const nextPaymentDate = parseSnowballDate(nextPaymentRaw)
    const nextPaymentAmt = parseFloat(obj['Next payment']) || 0
    const exDivRaw = obj['Ex-dividend date'] || ''
    const exDivDate = parseSnowballDate(exDivRaw)

    const divAnnual = parseFloat(obj['Dividends']) || 0
    const unrealizedPnl = currentValue - costBasis

    holdings.push({
      month: uploadMonth,
      ticker,
      name: obj["Holdings' name"] || ticker,
      shares,
      cost_per_share: costPerShare,
      cost_basis: costBasis,
      current_price: currentPrice,
      current_value: currentValue,
      unrealized_pnl: unrealizedPnl,
      broker,
      pays_dividend: divAnnual > 0 || divReceived > 0,
      dividend_yield: divYield,
      dividend_yield_on_cost: divYieldOnCost,
      div_received_cumulative: divReceived,
      next_payment_date: nextPaymentDate || undefined,
      next_payment_amount: nextPaymentAmt || undefined,
      ex_dividend_date: exDivDate || undefined,
      source: 'snowball',
    })
  }

  return { month: uploadMonth, holdings }
}
