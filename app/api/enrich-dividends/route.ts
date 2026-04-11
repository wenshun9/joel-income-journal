import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchSADividendBatch } from '@/lib/scrapers/stock-analysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for batch scraping

// POST /api/enrich-dividends
// Fetches dividend metadata from stockanalysis.com for all holdings in the latest month
// and updates the holdings table. Call after each IBKR upload.
export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Optionally pass a specific month, otherwise use the most recent
  let month: string | undefined
  try {
    const body = await request.json().catch(() => ({}))
    month = body.month
  } catch { /* */ }

  // Get all unique tickers from holdings
  let query = supabase.from('holdings').select('ticker, month').eq('user_id', user.id).order('month', { ascending: false })
  if (month) query = query.eq('month', month)
  else {
    const { data: latest } = await supabase
      .from('holdings').select('month').eq('user_id', user.id).order('month', { ascending: false }).limit(1)
    if (latest?.[0]) query = query.eq('month', latest[0].month)
  }

  const { data: holdings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!holdings?.length) return NextResponse.json({ updated: 0, message: 'No holdings found' })

  const tickers = Array.from(new Set(holdings.map(h => h.ticker)))
  const targetMonth = holdings[0].month

  // Fetch dividend data from stockanalysis.com
  const divData = await fetchSADividendBatch(tickers)

  // Update each holding with enriched data
  const updates: Array<PromiseLike<any>> = []
  let updatedCount = 0

  for (const [ticker, data] of divData) {
    if (!data) continue

    // Core fields (always exist in schema)
    const coreUpdate: Record<string, any> = {
      pays_dividend: data.pays_dividend,
    }
    if (data.name) coreUpdate.name = data.name
    if (data.annual_yield !== undefined) coreUpdate.dividend_yield = data.annual_yield
    if (data.ex_dividend_date) coreUpdate.ex_dividend_date = data.ex_dividend_date
    if (data.next_payment_date) coreUpdate.next_payment_date = data.next_payment_date
    if (data.last_payment_amount !== undefined) coreUpdate.next_payment_amount = data.last_payment_amount

    // Extended fields (require migration 001 — gracefully skipped if columns missing)
    const extendedUpdate: Record<string, any> = { ...coreUpdate }
    if (data.frequency) extendedUpdate.dividend_frequency = data.frequency
    if (data.annual_dividend !== undefined) extendedUpdate.annual_dividend_per_share = data.annual_dividend

    updates.push(
      supabase
        .from('holdings')
        .update(extendedUpdate)
        .eq('month', targetMonth)
        .eq('ticker', ticker)
        .then(async ({ error }) => {
          if (!error) { updatedCount++; return }
          // If error (e.g. column missing), retry with core fields only
          const { error: e2 } = await supabase
            .from('holdings')
            .update(coreUpdate)
            .eq('month', targetMonth)
            .eq('ticker', ticker)
          if (!e2) updatedCount++
        })
    )
  }

  await Promise.allSettled(updates)

  return NextResponse.json({
    success: true,
    month: targetMonth,
    tickers_checked: tickers.length,
    updated: updatedCount,
    dividend_payers: Array.from(divData.values()).filter(d => d.pays_dividend).length,
  })
}

// GET /api/enrich-dividends?ticker=ULTY — fetch data for a single ticker
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker param required' }, { status: 400 })

  const { fetchSADividend } = await import('@/lib/scrapers/stock-analysis')
  const data = await fetchSADividend(ticker)
  return NextResponse.json(data)
}
