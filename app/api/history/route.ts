import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { formatMonthLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export interface MonthHistoryEntry {
  month: string
  month_label: string
  month_short: string        // e.g. "Mar '26" for chart axis
  dividend_net: number
  dividend_gross: number
  dividend_tax: number
  options_pnl: number
  options_spx_pnl: number
  options_individual_pnl: number
  combined: number
  div_count: number          // number of dividend tickers
  opt_trade_count: number    // number of closed/expired option trades
  opt_win_count: number
}

function shortMonthLabel(month: string): string {
  // 'YYYY-MM' → "Mar '26"
  try {
    const [y, m] = month.split('-').map(Number)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[m - 1]} '${String(y).slice(2)}`
  } catch {
    return month
  }
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [divResult, optResult] = await Promise.all([
    supabase
      .from('dividend_payments')
      .select('upload_month, amount_net, amount_gross, withholding_tax, ticker')
      .eq('user_id', user.id),
    supabase
      .from('options_trades')
      .select('upload_month, realized_pnl, underlying, status')
      .eq('user_id', user.id)
      .in('status', ['closed', 'expired']),
  ])

  const divData = divResult.data || []
  const optData = optResult.data || []

  const months = new Set([
    ...divData.map(d => d.upload_month).filter(Boolean),
    ...optData.map(o => o.upload_month).filter(Boolean),
  ])

  const history: MonthHistoryEntry[] = []

  for (const month of months) {
    const divs = divData.filter(d => d.upload_month === month)
    const opts = optData.filter(o => o.upload_month === month)

    const dividend_net = divs.reduce((s, d) => s + (d.amount_net || 0), 0)
    const dividend_gross = divs.reduce((s, d) => s + (d.amount_gross || 0), 0)
    const dividend_tax = divs.reduce((s, d) => s + (d.withholding_tax || 0), 0)

    const spxOpts = opts.filter(o => o.underlying === 'SPXW' || o.underlying === 'SPX')
    const indivOpts = opts.filter(o => o.underlying !== 'SPXW' && o.underlying !== 'SPX')
    const options_spx_pnl = spxOpts.reduce((s, o) => s + (o.realized_pnl || 0), 0)
    const options_individual_pnl = indivOpts.reduce((s, o) => s + (o.realized_pnl || 0), 0)
    const options_pnl = options_spx_pnl + options_individual_pnl

    const uniqueDiv = new Set(divs.map(d => d.ticker))

    history.push({
      month,
      month_label: formatMonthLabel(month),
      month_short: shortMonthLabel(month),
      dividend_net,
      dividend_gross,
      dividend_tax,
      options_pnl,
      options_spx_pnl,
      options_individual_pnl,
      combined: dividend_net + options_pnl,
      div_count: uniqueDiv.size,
      opt_trade_count: opts.length,
      opt_win_count: opts.filter(o => (o.realized_pnl || 0) > 0).length,
    })
  }

  history.sort((a, b) => a.month.localeCompare(b.month))

  return NextResponse.json(history)
}
