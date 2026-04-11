import { NextRequest, NextResponse } from 'next/server'
import { fetchLivePrices } from '@/lib/yahoo-finance'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get('tickers')

  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
  }

  const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean)
  const prices = await fetchLivePrices(tickers)

  const out: Record<string, any> = {}
  for (const [ticker, lp] of prices) {
    out[ticker] = lp
  }

  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  })
}
