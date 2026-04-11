import { LivePrice } from '@/types'

// ─── In-memory price cache (5 min TTL) ────────────────────────────────────────
const priceCache = new Map<string, { data: LivePrice; ts: number }>()
const PRICE_TTL = 5 * 60 * 1000

// Singleton YahooFinance instance (v3 requires instantiation)
let _yf: any = null
async function getYF() {
  if (_yf) return _yf
  const mod = await import('yahoo-finance2')
  const YahooFinance = mod.default
  _yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
  return _yf
}

export async function fetchLivePrices(tickers: string[]): Promise<Map<string, LivePrice>> {
  const result = new Map<string, LivePrice>()
  if (!tickers.length) return result

  const now = Date.now()

  // Serve from cache where possible
  const uncached: string[] = []
  for (const t of tickers) {
    const cached = priceCache.get(t)
    if (cached && now - cached.ts < PRICE_TTL) {
      result.set(t, cached.data)
    } else {
      uncached.push(t)
    }
  }
  if (!uncached.length) return result

  try {
    const yf = await getYF()

    // Fetch all uncached tickers in parallel
    const settled = await Promise.allSettled(
      uncached.map(async ticker => {
        const q = await yf.quote(ticker, {}, { validateResult: false })
        return { ticker, q }
      })
    )

    for (const res of settled) {
      if (res.status !== 'fulfilled') continue
      const { ticker, q } = res.value
      if (!q || !q.regularMarketPrice) continue

      const lp: LivePrice = {
        ticker: q.symbol ?? ticker,
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        change_pct: q.regularMarketChangePercent ?? 0,
        timestamp: now,
      }
      result.set(ticker, lp)
      priceCache.set(ticker, { data: lp, ts: now })
    }
  } catch (err) {
    console.error('[yahoo-finance] fetchLivePrices error:', err)
  }

  return result
}

export async function fetchSinglePrice(ticker: string): Promise<LivePrice | null> {
  const prices = await fetchLivePrices([ticker])
  return prices.get(ticker) ?? null
}

// ─── Dividend Calendar ─────────────────────────────────────────────────────────
export interface YFDividendEvent {
  ticker: string
  date: string
  amount: number
}

export async function fetchUpcomingDividends(tickers: string[]): Promise<YFDividendEvent[]> {
  const results: YFDividendEvent[] = []
  if (!tickers.length) return results

  try {
    const yf = await getYF()
    const BATCH = 5
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      await Promise.allSettled(batch.map(async ticker => {
        try {
          const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          const rows = await yf.historical(ticker, { period1, events: 'dividends' }, { validateResult: false })
          if (!rows?.length) return
          const sorted = [...rows].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          const latest = sorted[0] as any
          if (latest?.dividends) {
            results.push({ ticker, date: new Date(latest.date).toISOString().split('T')[0], amount: latest.dividends })
          }
        } catch { /* ignore */ }
      }))
      if (i + BATCH < tickers.length) await new Promise(r => setTimeout(r, 200))
    }
  } catch { /* ignore */ }

  return results
}
