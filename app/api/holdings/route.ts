import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchLivePrices } from '@/lib/yahoo-finance'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rows: any[] = []

  if (month && month !== 'latest') {
    // ── Specific month requested: show exactly that month ──
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .order('ticker')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = data || []

  } else {
    // ── Default / "latest": smart merge of most-recent IBKR + most-recent Snowball ──
    const [ibkrLatest, snowballLatest] = await Promise.all([
      supabase.from('holdings').select('month').eq('user_id', user.id).eq('source', 'ibkr')
        .order('month', { ascending: false }).limit(1),
      supabase.from('holdings').select('month').eq('user_id', user.id).eq('source', 'snowball')
        .order('month', { ascending: false }).limit(1),
    ])

    const ibkrMonth   = ibkrLatest.data?.[0]?.month   ?? null
    const snowballMonth = snowballLatest.data?.[0]?.month ?? null

    // Fetch both data sets in parallel
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

    // Determine which source is more current overall
    const ibkrIsNewer = ibkrMonth && snowballMonth
      ? ibkrMonth >= snowballMonth
      : !!ibkrMonth

    // Primary source gets all its tickers; secondary only fills gaps
    const primary   = ibkrIsNewer ? ibkrRows : snowballRows
    const secondary = ibkrIsNewer ? snowballRows : ibkrRows

    const primaryTickers = new Set(primary.map((h: any) => h.ticker))

    // Add secondary rows only for tickers NOT covered by the primary source
    const gapFill = secondary.filter((h: any) => !primaryTickers.has(h.ticker))

    rows = [...primary, ...gapFill].sort((a, b) => a.ticker.localeCompare(b.ticker))
  }

  // ── Enrich with live prices ──
  const tickers = Array.from(new Set(rows.map((h: any) => h.ticker)))
  const prices = await fetchLivePrices(tickers)

  const enriched = rows.map((h: any) => {
    const lp = prices.get(h.ticker)
    const currentPrice = lp?.price || h.current_price || 0
    const currentValue = currentPrice * h.shares
    const unrealizedPnl = currentValue - h.cost_basis
    const unrealizedPnlPct = h.cost_basis > 0 ? (unrealizedPnl / h.cost_basis) * 100 : 0
    return {
      ...h,
      current_price: currentPrice,
      current_value: currentValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: unrealizedPnlPct,
      live_change: lp?.change,
      live_change_pct: lp?.change_pct,
    }
  })

  return NextResponse.json(enriched)
}
