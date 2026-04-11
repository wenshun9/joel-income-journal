import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { MonthlyReport, OptionTrade } from '@/types'
import { inferFrequency, calcAnnualisedYield, formatMonthLabel } from '@/lib/utils'
import { fetchLivePrices } from '@/lib/yahoo-finance'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Determine month: default to most recent month with data
  let month: string = searchParams.get('month') || ''
  if (!month) {
    const { data } = await supabase
      .from('dividend_payments')
      .select('upload_month')
      .eq('user_id', user.id)
      .order('upload_month', { ascending: false })
      .limit(1)
    month = data?.[0]?.upload_month || new Date().toISOString().slice(0, 7)
  }

  // ─── Dividends ───────────────────────────────────────────────────────────────
  const { data: divData } = await supabase
    .from('dividend_payments')
    .select('*')
    .eq('user_id', user.id)
    .eq('upload_month', month)

  const payments = divData || []
  const dividend_gross = payments.reduce((s, p) => s + p.amount_gross, 0)
  const dividend_tax = payments.reduce((s, p) => s + p.withholding_tax, 0)
  const dividend_net = payments.reduce((s, p) => s + p.amount_net, 0)

  // Aggregate dividend summary by ticker
  const tickerMap = new Map<string, { gross: number; net: number; tax: number; count: number; perShares: number[] }>()
  for (const p of payments) {
    if (!tickerMap.has(p.ticker)) tickerMap.set(p.ticker, { gross: 0, net: 0, tax: 0, count: 0, perShares: [] })
    const t = tickerMap.get(p.ticker)!
    t.gross += p.amount_gross; t.net += p.amount_net; t.tax += p.withholding_tax; t.count++
    if (p.per_share > 0) t.perShares.push(p.per_share)
  }

  // Get holding names — prefer full name over ticker-as-name, prefer most recent month
  const tickers = Array.from(tickerMap.keys())
  const { data: holdingsData } = await supabase
    .from('holdings')
    .select('ticker, name, broker, month')
    .eq('user_id', user.id)
    .in('ticker', tickers)
    .order('month', { ascending: false })
  const nameMap = new Map<string, string>()
  const brokerMap = new Map<string, string>()
  holdingsData?.forEach(h => {
    const existing = nameMap.get(h.ticker)
    // Prefer longer/different name over ticker symbol
    const newName = h.name && h.name !== h.ticker ? h.name : (existing || h.ticker)
    if (!existing || (h.name && h.name !== h.ticker && h.name.length > (existing?.length || 0))) {
      nameMap.set(h.ticker, newName)
    }
    if (!brokerMap.has(h.ticker)) brokerMap.set(h.ticker, h.broker)
  })

  // Get live prices for yield calculation — call directly, no HTTP self-request
  let priceMap: Record<string, number> = {}
  if (tickers.length > 0) {
    try {
      const prices = await fetchLivePrices(tickers)
      prices.forEach((lp, t) => { priceMap[t] = lp.price })
    } catch { /* skip */ }
  }

  const dividend_breakdown = Array.from(tickerMap.entries())
    .map(([ticker, d]) => {
      const freq = inferFrequency(ticker, d.count)
      const avgPS = d.perShares.length ? d.perShares.reduce((s, v) => s + v, 0) / d.perShares.length : 0
      const price = priceMap[ticker] || 0
      const annYield = price > 0 && avgPS > 0 ? calcAnnualisedYield(avgPS, freq, price) : 0
      return {
        ticker,
        name: nameMap.get(ticker) || ticker,
        total_gross: d.gross,
        total_net: d.net,
        total_tax: d.tax,
        payment_count: d.count,
        pct_of_total: dividend_net > 0 ? (d.net / dividend_net) * 100 : 0,
        frequency: freq,
        annualised_yield: annYield > 0 ? annYield : undefined,
        broker: brokerMap.get(ticker),
      }
    })
    .sort((a, b) => b.total_net - a.total_net)

  // ─── Options ─────────────────────────────────────────────────────────────────
  const { data: optData } = await supabase
    .from('options_trades')
    .select('*')
    .eq('user_id', user.id)
    .eq('upload_month', month)
    .in('status', ['closed', 'expired'])

  const allTrades: OptionTrade[] = (optData || []).map(o => ({ ...o }))
  const spxTrades = allTrades.filter(t => t.underlying === 'SPXW' || t.underlying === 'SPX')
  const individualTrades = allTrades.filter(t => t.underlying !== 'SPXW' && t.underlying !== 'SPX')

  const options_spx_pnl = spxTrades.reduce((s, t) => s + (t.realized_pnl || 0), 0)
  const options_individual_pnl = individualTrades.reduce((s, t) => s + (t.realized_pnl || 0), 0)
  const options_total_pnl = options_spx_pnl + options_individual_pnl

  // ─── Previous month comparison ────────────────────────────────────────────────
  const prevMonth = getPrevMonth(month)
  const { data: prevDiv } = await supabase
    .from('dividend_payments').select('amount_net').eq('user_id', user.id).eq('upload_month', prevMonth)
  const { data: prevOpt } = await supabase
    .from('options_trades').select('realized_pnl')
    .eq('user_id', user.id).eq('upload_month', prevMonth).in('status', ['closed', 'expired'])

  const prevDivNet = (prevDiv || []).reduce((s, p) => s + p.amount_net, 0)
  const prevOptPnl = (prevOpt || []).reduce((s, o) => s + (o.realized_pnl || 0), 0)
  const prev_month_combined = prevDivNet + prevOptPnl

  const report: MonthlyReport = {
    month,
    month_label: formatMonthLabel(month),
    dividend_net,
    dividend_gross,
    dividend_tax,
    options_individual_pnl,
    options_spx_pnl,
    options_total_pnl,
    combined_total: dividend_net + options_total_pnl,
    prev_month_combined: prev_month_combined > 0 ? prev_month_combined : undefined,
    dividend_breakdown,
    options_trades: allTrades,
    spx_trades: spxTrades,
  }

  return NextResponse.json(report)
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const prev = new Date(y, m - 2)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}
