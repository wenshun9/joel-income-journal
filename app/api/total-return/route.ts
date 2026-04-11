import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchLivePrices } from '@/lib/yahoo-finance'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Step 1: Smart-merge latest holdings ──
  const [ibkrLatest, snowballLatest] = await Promise.all([
    supabase.from('holdings').select('month').eq('user_id', user.id).eq('source', 'ibkr')
      .order('month', { ascending: false }).limit(1),
    supabase.from('holdings').select('month').eq('user_id', user.id).eq('source', 'snowball')
      .order('month', { ascending: false }).limit(1),
  ])

  const ibkrMonth     = ibkrLatest.data?.[0]?.month   ?? null
  const snowballMonth = snowballLatest.data?.[0]?.month ?? null

  const [ibkrRes, snowballRes] = await Promise.all([
    ibkrMonth
      ? supabase.from('holdings').select('*').eq('user_id', user.id).eq('month', ibkrMonth).eq('source', 'ibkr').order('ticker')
      : Promise.resolve({ data: [] as any[], error: null }),
    snowballMonth
      ? supabase.from('holdings').select('*').eq('user_id', user.id).eq('month', snowballMonth).eq('source', 'snowball').order('ticker')
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  const ibkrRows     = ibkrRes.data     || []
  const snowballRows = snowballRes.data || []

  if (ibkrRows.length === 0 && snowballRows.length === 0) {
    return NextResponse.json([])
  }

  const ibkrIsNewer = ibkrMonth && snowballMonth
    ? ibkrMonth >= snowballMonth
    : !!ibkrMonth

  const primary   = ibkrIsNewer ? ibkrRows : snowballRows
  const secondary = ibkrIsNewer ? snowballRows : ibkrRows
  const primaryTickers = new Set(primary.map((h: any) => h.ticker))
  const gapFill = secondary.filter((h: any) => !primaryTickers.has(h.ticker))

  const rows: any[] = [...primary, ...gapFill].sort((a, b) => a.ticker.localeCompare(b.ticker))

  // ── Step 2: Best available dividend totals per ticker ──
  //
  // Priority order (most accurate → least accurate):
  //   1. div_received_cumulative from latest Snowball row
  //      → Snowball tracks ALL dividends since you started, not just uploaded months
  //   2. SUM of uploaded dividend_payments rows
  //      → Only covers months you've actually uploaded statements for
  //
  // We query the latest Snowball row for EVERY ticker independently so we always
  // get the most recent cumulative figure, even when the smart-merge primary row
  // is an IBKR row from a different (older) month.

  const tickerList = rows.map((h: any) => h.ticker)

  const [snowballDivRes, uploadedDivRes] = await Promise.all([
    // Latest Snowball div_received_cumulative per ticker
    supabase
      .from('holdings')
      .select('ticker, div_received_cumulative, month')
      .eq('user_id', user.id)
      .eq('source', 'snowball')
      .in('ticker', tickerList)
      .order('month', { ascending: false }),

    // Fallback: sum of all uploaded dividend payments
    supabase
      .from('dividend_payments')
      .select('ticker, amount_net')
      .eq('user_id', user.id),
  ])

  // Build Snowball cumulative map — keep only the most recent row per ticker
  const snowballDivMap = new Map<string, number>()
  for (const row of (snowballDivRes.data || [])) {
    if (!snowballDivMap.has(row.ticker) && (row.div_received_cumulative ?? 0) > 0) {
      snowballDivMap.set(row.ticker, row.div_received_cumulative)
    }
  }

  // Build uploaded-payments fallback map
  const uploadedDivMap = new Map<string, number>()
  for (const d of (uploadedDivRes.data || [])) {
    uploadedDivMap.set(d.ticker, (uploadedDivMap.get(d.ticker) || 0) + d.amount_net)
  }

  // ── Step 3: Fetch live prices ──
  const tickers = Array.from(new Set(rows.map((h: any) => h.ticker)))
  const prices = await fetchLivePrices(tickers)

  // ── Step 4: Build total return data ──
  const enriched = rows.map((h: any) => {
    const lp = prices.get(h.ticker)
    const currentPrice  = lp?.price || h.current_price || 0
    const currentValue  = currentPrice * h.shares
    const costBasis     = h.cost_basis || 0
    const unrealizedPnl = currentValue - costBasis
    const unrealizedPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0

    // Use Snowball cumulative if available (much more accurate); fall back to uploaded payments
    const snowballDiv    = snowballDivMap.get(h.ticker)
    const uploadedDiv    = uploadedDivMap.get(h.ticker) || 0
    const totalDividends = (snowballDiv !== undefined && snowballDiv > 0)
      ? snowballDiv
      : uploadedDiv
    const divSource      = (snowballDiv !== undefined && snowballDiv > 0) ? 'snowball' : 'uploaded'

    const totalReturn       = unrealizedPnl + totalDividends
    const totalReturnPct    = costBasis > 0 ? (totalReturn / costBasis) * 100 : 0
    const dividendReturnPct = costBasis > 0 ? (totalDividends / costBasis) * 100 : 0

    return {
      ...h,
      current_price:       currentPrice,
      current_value:       currentValue,
      unrealized_pnl:      unrealizedPnl,
      unrealized_pnl_pct:  unrealizedPct,
      live_change_pct:     lp?.change_pct,
      total_dividends:     totalDividends,
      div_source:          divSource,
      total_return:        totalReturn,
      total_return_pct:    totalReturnPct,
      dividend_return_pct: dividendReturnPct,
    }
  })

  // ── Step 5: Portfolio-level totals ──
  const portfolioCost            = enriched.reduce((s, h) => s + (h.cost_basis || 0), 0)
  const portfolioValue           = enriched.reduce((s, h) => s + h.current_value, 0)
  const portfolioUnrealizedPnl   = portfolioValue - portfolioCost
  const portfolioAllDividends    = enriched.reduce((s, h) => s + h.total_dividends, 0)
  const portfolioTotalReturn     = portfolioUnrealizedPnl + portfolioAllDividends
  const portfolioTotalReturnPct  = portfolioCost > 0 ? (portfolioTotalReturn / portfolioCost) * 100 : 0

  return NextResponse.json({
    holdings: enriched,
    summary: {
      portfolio_cost:             portfolioCost,
      portfolio_value:            portfolioValue,
      portfolio_unrealized_pnl:   portfolioUnrealizedPnl,
      portfolio_all_dividends:    portfolioAllDividends,
      portfolio_total_return:     portfolioTotalReturn,
      portfolio_total_return_pct: portfolioTotalReturnPct,
    },
  })
}
