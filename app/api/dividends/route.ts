import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { MonthlyDividendSummary } from '@/types'
import { inferFrequency, calcAnnualisedYield } from '@/lib/utils'
import { fetchLivePrices } from '@/lib/yahoo-finance'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase
    .from('dividend_payments')
    .select('*')
    .eq('user_id', user.id)
    .order('payment_date', { ascending: true })

  if (month) {
    query = query.eq('upload_month', month)
  } else {
    const { data: latest } = await supabase
      .from('dividend_payments')
      .select('upload_month')
      .eq('user_id', user.id)
      .order('upload_month', { ascending: false })
      .limit(1)
    if (latest?.[0]) query = query.eq('upload_month', latest[0].upload_month)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const payments = data || []

  // Aggregate by ticker for summary
  const tickerMap = new Map<string, {
    gross: number; net: number; tax: number; count: number;
    perShares: number[]; dates: string[]
  }>()

  for (const p of payments) {
    if (!tickerMap.has(p.ticker)) {
      tickerMap.set(p.ticker, { gross: 0, net: 0, tax: 0, count: 0, perShares: [], dates: [] })
    }
    const t = tickerMap.get(p.ticker)!
    t.gross += p.amount_gross
    t.net += p.amount_net
    t.tax += p.withholding_tax
    t.count++
    if (p.per_share > 0) t.perShares.push(p.per_share)
    t.dates.push(p.payment_date)
  }

  const totalNet = Array.from(tickerMap.values()).reduce((s, t) => s + t.net, 0)

  // Get current prices for yield calculation — call directly, no HTTP self-request
  const tickers = Array.from(tickerMap.keys())
  let priceMap: Record<string, number> = {}
  if (tickers.length > 0) {
    try {
      const prices = await fetchLivePrices(tickers)
      prices.forEach((lp, t) => { priceMap[t] = lp.price })
    } catch { /* skip if unavailable */ }
  }

  // Get holding names — prefer full name over ticker-as-name
  const { data: holdingsData } = await supabase
    .from('holdings')
    .select('ticker, name')
    .eq('user_id', user.id)
    .in('ticker', tickers)
    .order('month', { ascending: false })
  const nameMap = new Map<string, string>()
  holdingsData?.forEach(h => {
    const existing = nameMap.get(h.ticker)
    if (!existing || (h.name && h.name !== h.ticker && h.name.length > (existing?.length || 0))) {
      nameMap.set(h.ticker, h.name && h.name !== h.ticker ? h.name : (existing || h.ticker))
    }
  })

  const summary: MonthlyDividendSummary[] = Array.from(tickerMap.entries())
    .map(([ticker, data]) => {
      const frequency = inferFrequency(ticker, data.count)
      const avgPerShare = data.perShares.length > 0
        ? data.perShares.reduce((s, v) => s + v, 0) / data.perShares.length
        : 0
      const price = priceMap[ticker] || 0
      let annYield = 0
      if (price > 0 && avgPerShare > 0) {
        annYield = calcAnnualisedYield(avgPerShare, frequency, price)
      }

      return {
        ticker,
        name: nameMap.get(ticker) || ticker,
        total_gross: data.gross,
        total_net: data.net,
        total_tax: data.tax,
        payment_count: data.count,
        pct_of_total: totalNet > 0 ? (data.net / totalNet) * 100 : 0,
        frequency,
        annualised_yield: annYield > 0 ? annYield : undefined,
      }
    })
    .sort((a, b) => b.total_net - a.total_net)

  return NextResponse.json({
    month: month || payments[0]?.upload_month || '',
    payments,
    summary,
    totals: {
      gross: payments.reduce((s, p) => s + p.amount_gross, 0),
      net: payments.reduce((s, p) => s + p.amount_net, 0),
      tax: payments.reduce((s, p) => s + p.withholding_tax, 0),
    },
  })
}
