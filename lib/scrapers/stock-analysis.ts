// ─── Stock Analysis scraper ────────────────────────────────────────────────────
// Fetches dividend metadata from stockanalysis.com — no API key needed.
// Tries ETF path first, then stocks path.

export interface SADividendData {
  ticker: string
  name?: string
  annual_yield?: number          // e.g. 1.2947 = 129.47%
  annual_dividend?: number       // $ per share per year
  frequency?: string             // "Weekly" | "Monthly" | "Quarterly" | "Annual"
  ex_dividend_date?: string      // YYYY-MM-DD
  next_payment_date?: string     // YYYY-MM-DD
  last_payment_amount?: number   // most recent payment $ per share
  pays_dividend: boolean
}

const SA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Simple in-memory cache (1 hour TTL)
const cache = new Map<string, { data: SADividendData; ts: number }>()
const TTL = 60 * 60 * 1000

function extractNextData(html: string): any {
  try {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    if (match?.[1]) return JSON.parse(match[1])
  } catch { /* */ }
  return null
}

function parseDate(str: string | undefined | null): string | undefined {
  if (!str) return undefined
  try {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch { /* */ }
  return undefined
}

function parseFrequency(freq: string | undefined | null): string | undefined {
  if (!freq) return undefined
  const f = freq.toLowerCase()
  if (f.includes('week')) return 'Weekly'
  if (f.includes('month')) return 'Monthly'
  if (f.includes('quarter')) return 'Quarterly'
  if (f.includes('annual') || f.includes('year')) return 'Annual'
  if (f.includes('semi')) return 'Semi-Annual'
  return freq
}

async function fetchSAPage(ticker: string, type: 'etf' | 'stocks'): Promise<SADividendData | null> {
  try {
    const url = `https://stockanalysis.com/${type}/${ticker.toLowerCase()}/dividend/`
    const res = await fetch(url, { headers: SA_HEADERS })
    if (!res.ok) return null

    const html = await res.text()

    // ── Try __NEXT_DATA__ JSON first ──────────────────────────────────────────
    const nextData = extractNextData(html)
    if (nextData) {
      // Walk the props tree for dividend data
      const props = nextData?.props?.pageProps
      const divData = props?.dividendData || props?.data?.dividend || props?.info?.dividend

      if (divData) {
        const yield_ = divData.yield ? parseFloat(divData.yield) / 100 : undefined
        const exDate = parseDate(divData.exDividendDate || divData.exDate)
        const payDate = parseDate(divData.paymentDate || divData.payDate || divData.nextPayDate)
        const freq = parseFrequency(divData.payoutFrequency || divData.frequency)
        const annualAmt = divData.annualDividend ? parseFloat(divData.annualDividend) : undefined
        const lastAmt = divData.lastDividendAmount ? parseFloat(divData.lastDividendAmount) : undefined
        const name = props?.info?.name || props?.name

        return {
          ticker: ticker.toUpperCase(),
          name,
          annual_yield: yield_,
          annual_dividend: annualAmt,
          frequency: freq,
          ex_dividend_date: exDate,
          next_payment_date: payDate,
          last_payment_amount: lastAmt,
          pays_dividend: !!(exDate || payDate || annualAmt),
        }
      }
    }

    // ── Fallback: regex scrape the rendered HTML ───────────────────────────────
    const result: SADividendData = { ticker: ticker.toUpperCase(), pays_dividend: false }

    // Extract yield
    const yieldMatch = html.match(/(\d+\.?\d*)\s*%[\s\S]{0,200}?dividend\s*yield/i) ||
      html.match(/Dividend\s*Yield[\s\S]{0,100}?(\d+\.?\d*)\s*%/i)
    if (yieldMatch) result.annual_yield = parseFloat(yieldMatch[1]) / 100

    // Extract ex-dividend date (look for date patterns near "ex-dividend" or "ex dividend")
    const exMatch = html.match(/ex[\s-]dividend\s*date[\s\S]{0,200}?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i)
    if (exMatch) result.ex_dividend_date = parseDate(exMatch[1] ? exMatch[0].match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i)?.[0] : undefined)

    // Extract frequency
    const freqMatch = html.match(/payout\s*frequency[\s\S]{0,200}?(Weekly|Monthly|Quarterly|Annual|Semi-Annual)/i)
    if (freqMatch) result.frequency = parseFrequency(freqMatch[1])

    // Extract annual dividend amount
    const annualMatch = html.match(/Annual\s*Dividend[\s\S]{0,200}?\$\s*(\d+\.?\d*)/i)
    if (annualMatch) result.annual_dividend = parseFloat(annualMatch[1])

    // Extract last dividend amount from history table (first row)
    const lastAmtMatch = html.match(/\$\s*(0\.\d+)\s*<\/td>[\s\S]{0,50}?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)
    if (lastAmtMatch) result.last_payment_amount = parseFloat(lastAmtMatch[1])

    result.pays_dividend = !!(result.annual_yield || result.ex_dividend_date || result.annual_dividend)

    return result.pays_dividend ? result : null
  } catch {
    return null
  }
}

export async function fetchSADividend(ticker: string): Promise<SADividendData> {
  const now = Date.now()
  const cached = cache.get(ticker)
  if (cached && now - cached.ts < TTL) return cached.data

  // Try ETF first, then stocks
  let data = await fetchSAPage(ticker, 'etf')
  if (!data) data = await fetchSAPage(ticker, 'stocks')

  const result: SADividendData = data ?? { ticker, pays_dividend: false }
  cache.set(ticker, { data: result, ts: now })
  return result
}

export async function fetchSADividendBatch(
  tickers: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, SADividendData>> {
  const result = new Map<string, SADividendData>()
  if (!tickers.length) return result

  const BATCH = 5
  let done = 0

  for (let i = 0; i < tickers.length; i += BATCH) {
    const chunk = tickers.slice(i, i + BATCH)
    const settled = await Promise.allSettled(chunk.map(t => fetchSADividend(t)))
    for (let j = 0; j < chunk.length; j++) {
      const r = settled[j]
      const data = r.status === 'fulfilled' ? r.value : { ticker: chunk[j], pays_dividend: false }
      result.set(chunk[j], data)
    }
    done += chunk.length
    onProgress?.(done, tickers.length)
    // Be polite — space out requests
    if (i + BATCH < tickers.length) await new Promise(r => setTimeout(r, 500))
  }

  return result
}
