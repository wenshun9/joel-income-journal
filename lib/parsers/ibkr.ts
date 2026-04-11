import { format, parse as dateParse, isValid } from 'date-fns'
import {
  Holding, DividendPayment, OptionTrade, Transaction, IBKRParsedData
} from '@/types'
import { parseCSVRow, parseOptionSymbol, inferTradeType, dateToMonth } from '@/lib/utils'

// ─── Section parser ────────────────────────────────────────────────────────────

interface SectionData {
  headers: string[]
  rows: string[][]
}

function extractSections(csvContent: string): Map<string, SectionData> {
  const sections = new Map<string, SectionData>()
  const lines = csvContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const cells = parseCSVRow(trimmed)
    if (cells.length < 2) continue

    const sectionName = cells[0]
    const rowType = cells[1]

    if (!sections.has(sectionName)) {
      sections.set(sectionName, { headers: [], rows: [] })
    }

    const section = sections.get(sectionName)!
    if (rowType === 'Header') {
      section.headers = cells.slice(2)
    } else if (rowType === 'Data') {
      section.rows.push(cells.slice(2))
    }
  }
  return sections
}

function rowToObj(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {}
  headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
  return obj
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function parseIBKRDate(dateStr: string): string {
  // Handles "2026-03-02" or "2026-03-02, 10:24:58"
  const clean = (dateStr || '').split(',')[0].trim()
  try {
    const d = new Date(clean)
    if (isValid(d)) return format(d, 'yyyy-MM-dd')
  } catch { /* */ }
  return clean
}

function parseStatementMonth(sections: Map<string, SectionData>): string {
  const stmt = sections.get('Statement')
  if (!stmt) return format(new Date(), 'yyyy-MM')
  const periodRow = stmt.rows.find(r => r[0] === 'Period')
  if (periodRow && periodRow[1]) {
    // "March 1, 2026 - March 31, 2026"
    const match = periodRow[1].match(/(\w+ \d{1,2}, \d{4})/)
    if (match) {
      try {
        const d = new Date(match[1])
        if (isValid(d)) return format(d, 'yyyy-MM')
      } catch { /* */ }
    }
  }
  return format(new Date(), 'yyyy-MM')
}

// ─── Dividend description parser ───────────────────────────────────────────────

function parseDivDescription(description: string): {
  ticker: string
  perShare: number
  isPIL: boolean
} {
  const tickerMatch = description.match(/^([A-Z0-9]+)\(/)
  const ticker = tickerMatch ? tickerMatch[1] : ''
  const perShareMatch = description.match(/USD ([\d.]+) per Share/)
  const perShare = perShareMatch ? parseFloat(perShareMatch[1]) : 0
  const isPIL = description.toLowerCase().includes('payment in lieu')
  return { ticker, perShare, isPIL }
}

// ─── Holdings parser (from Open Positions section) ────────────────────────────

function parseHoldings(sections: Map<string, SectionData>, month: string): Holding[] {
  const section = sections.get('Open Positions')
  if (!section) return []

  // ── Detect column positions from header (handles multi-account statements) ──
  const headers = section.headers
  let discrimIdx = 0, categoryIdx = 1, symbolIdx = 3
  let qtyIdx = 4, costPriceIdx = 6, costBasisIdx = 7
  let closePriceIdx = 8, valueIdx = 9, unrealizedIdx = 10

  if (headers.length > 0) {
    const fi = (terms: string[]) =>
      headers.findIndex(h => terms.some(t => h.toLowerCase().includes(t.toLowerCase())))
    const d = fi(['data discriminator', 'discriminator']); if (d >= 0) discrimIdx = d
    const c = fi(['asset category']); if (c >= 0) categoryIdx = c
    const s = fi(['symbol', 'ticker']); if (s >= 0) symbolIdx = s
    const q = fi(['quantity']); if (q >= 0) qtyIdx = q
    const cp = fi(['cost price', 'cost/price', 'avg price']); if (cp >= 0) costPriceIdx = cp
    const cb = fi(['cost basis']); if (cb >= 0) costBasisIdx = cb
    const clp = fi(['close price', 'mark price', 'value per unit']); if (clp >= 0) closePriceIdx = clp
    const v = fi(['position value', 'total value']); if (v >= 0) valueIdx = v
    const u = fi(['unrealized']); if (u >= 0) unrealizedIdx = u
  }

  const holdings: Holding[] = []

  // Asset categories that represent stock/equity positions (not options, forex, bonds)
  const EQUITY_CATEGORIES = new Set([
    'Stocks', 'ETF', 'ETFs', 'ETP', 'ETPs',
    'Exchange Traded Instruments', 'Exchange Traded Funds',
    'Trust', 'Trusts', 'Equity', 'Equities',
  ])

  for (const row of section.rows) {
    // Only Summary rows for equity-like instruments
    if (row[discrimIdx] !== 'Summary') continue
    const cat = (row[categoryIdx] || '').trim()
    if (!EQUITY_CATEGORIES.has(cat)) continue

    const ticker = row[symbolIdx]
    const shares = parseFloat(row[qtyIdx]) || 0
    const costPerShare = parseFloat(row[costPriceIdx]) || 0
    const costBasis = parseFloat(row[costBasisIdx]) || 0
    const currentPrice = parseFloat(row[closePriceIdx]) || 0
    const currentValue = parseFloat(row[valueIdx]) || 0
    const unrealizedPnl = parseFloat(row[unrealizedIdx]) || 0

    if (!ticker || shares === 0) continue

    holdings.push({
      month,
      ticker,
      name: ticker, // will be enriched by stockanalysis.com or Snowball
      shares,
      cost_per_share: costPerShare,
      cost_basis: Math.abs(costBasis),
      current_price: currentPrice,
      current_value: currentValue,
      unrealized_pnl: unrealizedPnl,
      broker: 'IBKR',
      pays_dividend: false, // conservative default; enrichment will set true for payers
      source: 'ibkr',
    })
  }

  return holdings
}

// ─── Dividends parser ─────────────────────────────────────────────────────────

function parseDividends(
  sections: Map<string, SectionData>,
  month: string
): { dividends: DividendPayment[], taxMap: Map<string, number> } {
  const divSection = sections.get('Dividends')
  const taxSection = sections.get('Withholding Tax')

  // Build withholding tax map: "ticker|date" → tax amount
  const taxMap = new Map<string, number>()
  if (taxSection) {
    for (const row of taxSection.rows) {
      // Currency, Date, Description, Amount
      if (row.length < 4) continue
      const date = parseIBKRDate(row[1])
      const { ticker } = parseDivDescription(row[2])
      const amount = Math.abs(parseFloat(row[3]) || 0)
      const key = `${ticker}|${date}`
      taxMap.set(key, (taxMap.get(key) || 0) + amount)
    }
  }

  const dividends: DividendPayment[] = []
  if (!divSection) return { dividends, taxMap }

  for (const row of divSection.rows) {
    // Currency, Date, Description, Amount
    if (row.length < 4) continue
    const currency = row[0]
    if (currency !== 'USD') continue // only USD dividends

    const date = parseIBKRDate(row[1])
    const description = row[2]
    const gross = parseFloat(row[3]) || 0

    if (gross <= 0) continue

    const { ticker, perShare, isPIL } = parseDivDescription(description)
    if (!ticker) continue

    const taxKey = `${ticker}|${date}`
    const tax = taxMap.get(taxKey) || 0
    const net = gross - tax

    dividends.push({
      ticker,
      payment_date: date,
      amount_gross: gross,
      withholding_tax: tax,
      amount_net: net,
      per_share: perShare,
      description,
      payment_type: isPIL ? 'pil' : 'ordinary',
      upload_month: month,
      source: 'ibkr',
    })
  }

  return { dividends, taxMap }
}

// ─── Options parser ────────────────────────────────────────────────────────────

function parseOptions(
  sections: Map<string, SectionData>,
  month: string
): OptionTrade[] {
  const rlzSection = sections.get('Realized & Unrealized Performance Summary')
  const tradesSection = sections.get('Trades')
  const openPosSection = sections.get('Open Positions')

  // ── Build realized P&L map from Performance Summary ──
  // Use header row to find the correct column index for "Realized P/L" or "Realized Total"
  const realizedMap = new Map<string, number>()
  if (rlzSection) {
    // Find which column index is the realized P/L
    let rlzColIdx = -1
    if (rlzSection.headers.length > 0) {
      rlzColIdx = rlzSection.headers.findIndex(h =>
        /realized/i.test(h) && !/unrealized/i.test(h)
      )
    }

    for (const row of rlzSection.rows) {
      if (row[0] !== 'Equity and Index Options') continue
      const symbol = row[1]
      if (!symbol) continue
      // Use detected column, fall back to trying multiple indices
      const candidates = rlzColIdx >= 0
        ? [rlzColIdx]
        : [12, 11, 10, 9, 8, 7, 6] // try common positions
      for (const idx of candidates) {
        const val = parseFloat(row[idx])
        if (!isNaN(val) && val !== 0) {
          realizedMap.set(symbol, (realizedMap.get(symbol) || 0) + val)
          break
        }
      }
    }
  }

  // ── Build open positions set ──
  const openSymbols = new Set<string>()
  if (openPosSection) {
    for (const row of openPosSection.rows) {
      if (row[0] === 'Summary' && row[1] === 'Equity and Index Options') {
        openSymbols.add(row[3])
      }
    }
  }

  // ── Parse trades section ──
  // Columns (after slice(2)): DataDiscriminator, Asset Category, Currency, Symbol,
  //   Date/Time, Quantity, T.Price, C.Price, Proceeds, Comm/Fee, Basis, Realized P/L, MTM P/L, Code
  const tradesBySymbol = new Map<string, {
    openDate?: string, closeDate?: string,
    openPrice?: number, closePrice?: number,
    contracts: number, proceeds: number, commission: number,
    realizedPnlFromTrades: number, openQuantity: number,
  }>()

  // Use header to find column positions robustly
  let tradeSymbolIdx = 3, tradeDateIdx = 4, tradeQtyIdx = 5
  let tradePriceIdx = 6, tradeProceedsIdx = 8, tradeCommIdx = 9
  let tradeRlzIdx = 11, tradeCodeIdx = 13
  if (tradesSection?.headers.length) {
    const h = tradesSection.headers
    const fi = (terms: string[]) => h.findIndex(col => terms.some(t => col.toLowerCase().includes(t)))
    const si = fi(['symbol']); if (si >= 0) tradeSymbolIdx = si
    const di = fi(['date']); if (di >= 0) tradeDateIdx = di
    const qi = fi(['quantity']); if (qi >= 0) tradeQtyIdx = qi
    const pi = fi(['t.price', 'trade price']); if (pi >= 0) tradePriceIdx = pi
    const pri = fi(['proceeds']); if (pri >= 0) tradeProceedsIdx = pri
    const ci = fi(['comm', 'fee']); if (ci >= 0) tradeCommIdx = ci
    const ri = fi(['realized p/l', 'realized p&l', 'realized']); if (ri >= 0) tradeRlzIdx = ri
    const coi = fi(['code']); if (coi >= 0) tradeCodeIdx = coi
  }

  if (tradesSection) {
    for (const row of tradesSection.rows) {
      if (row[1] !== 'Equity and Index Options') continue
      const symbol = row[tradeSymbolIdx]
      if (!symbol) continue

      const dateTime = parseIBKRDate(row[tradeDateIdx])
      const qty = parseFloat(row[tradeQtyIdx]) || 0
      const tPrice = parseFloat(row[tradePriceIdx]) || 0
      const proceeds = parseFloat(row[tradeProceedsIdx]) || 0
      const commission = parseFloat(row[tradeCommIdx]) || 0
      const rowRlzPnl = parseFloat(row[tradeRlzIdx]) || 0
      const code = row[tradeCodeIdx] || ''

      if (!tradesBySymbol.has(symbol)) {
        tradesBySymbol.set(symbol, {
          contracts: Math.abs(qty), proceeds: 0, commission: 0,
          realizedPnlFromTrades: 0, openQuantity: 0,
        })
      }
      const t = tradesBySymbol.get(symbol)!
      t.commission += Math.abs(commission)
      t.proceeds += proceeds
      t.realizedPnlFromTrades += rowRlzPnl

      if (code.includes('O')) {
        t.openDate = dateTime
        t.openPrice = Math.abs(tPrice)
        t.openQuantity = Math.abs(qty)
        t.contracts = Math.abs(qty)
      } else if (code.includes('C')) {
        t.closeDate = dateTime
        t.closePrice = Math.abs(tPrice)
      }
    }
  }

  const trades: OptionTrade[] = []
  const processedSymbols = new Set<string>()
  const allSymbols = new Set([...realizedMap.keys(), ...openSymbols, ...tradesBySymbol.keys()])

  for (const symbol of allSymbols) {
    if (processedSymbols.has(symbol)) continue
    processedSymbols.add(symbol)

    const parsed = parseOptionSymbol(symbol)
    if (!parsed) continue

    const tradeInfo = tradesBySymbol.get(symbol)
    const isOpen = openSymbols.has(symbol)

    // ── Determine realized P&L ──
    // Priority: Performance Summary → Trades section sum → calculate from net proceeds
    let realizedPnl: number | undefined = undefined
    if (!isOpen) {
      const fromSummary = realizedMap.get(symbol)
      const fromTrades = tradeInfo?.realizedPnlFromTrades
      const fromProceeds = tradeInfo ? tradeInfo.proceeds - tradeInfo.commission : undefined

      if (fromSummary !== undefined && fromSummary !== 0) {
        realizedPnl = fromSummary
      } else if (fromTrades !== undefined && fromTrades !== 0) {
        realizedPnl = fromTrades
      } else if (fromProceeds !== undefined) {
        // Net proceeds = premium collected - buyback cost; commission already subtracted
        realizedPnl = fromProceeds
      }
    }

    // Parse expiry date e.g. "27MAR26"
    let expiryISO = ''
    try {
      const d = dateParse(parsed.expiry, 'ddMMMyy', new Date())
      if (isValid(d)) expiryISO = format(d, 'yyyy-MM-dd')
    } catch { /* */ }

    const isSpread = parsed.underlying === 'SPXW' || parsed.underlying === 'SPX'
    const tradeType = isSpread
      ? (parsed.optionType === 'P' ? 'PutSpread' : 'CallSpread')
      : (parsed.optionType === 'P' ? 'CSP' : 'CoveredCall')

    const contracts = tradeInfo?.contracts || 1
    // premium_collected = net proceeds when sold (positive number)
    const premiumCollected = tradeInfo ? Math.max(0, tradeInfo.proceeds) : 0

    trades.push({
      underlying: parsed.underlying,
      symbol,
      trade_type: tradeType as OptionTrade['trade_type'],
      open_date: tradeInfo?.openDate || '',
      expiry_date: expiryISO,
      strike_sell: parsed.strike,
      contracts,
      multiplier: 100,
      premium_collected: premiumCollected,
      open_price: tradeInfo?.openPrice || 0,
      close_date: tradeInfo?.closeDate,
      close_price: tradeInfo?.closePrice,
      commission: tradeInfo?.commission || 0,
      realized_pnl: realizedPnl,
      status: isOpen ? 'open' : 'closed',
      source: 'ibkr_import',
      upload_month: month,
    })
  }

  return mergeSpreadLegs(trades)
}

function mergeSpreadLegs(trades: OptionTrade[]): OptionTrade[] {
  const spreads: OptionTrade[] = []
  const nonSpreads: OptionTrade[] = []
  const used = new Set<number>()

  trades.forEach((t, i) => {
    if (t.trade_type === 'PutSpread' || t.trade_type === 'CallSpread') {
      spreads.push(t)
    } else {
      nonSpreads.push(t)
    }
  })

  const merged: OptionTrade[] = [...nonSpreads]
  const spreadUsed = new Set<number>()

  for (let i = 0; i < spreads.length; i++) {
    if (spreadUsed.has(i)) continue
    const a = spreads[i]

    // Find matching leg: same underlying, same expiry, same type, different strike
    let partnerIdx = -1
    for (let j = i + 1; j < spreads.length; j++) {
      if (spreadUsed.has(j)) continue
      const b = spreads[j]
      if (
        b.underlying === a.underlying &&
        b.expiry_date === a.expiry_date &&
        b.trade_type === a.trade_type &&
        b.strike_sell !== a.strike_sell
      ) {
        partnerIdx = j
        break
      }
    }

    if (partnerIdx >= 0) {
      const b = spreads[partnerIdx]
      spreadUsed.add(i)
      spreadUsed.add(partnerIdx)

      // The sell leg has higher premium collected (negative quantity = sold)
      // Combined P&L = sum of both legs
      const combinedPnl = (a.realized_pnl || 0) + (b.realized_pnl || 0)
      const combinedPremium = (a.premium_collected || 0) + (b.premium_collected || 0)

      // Determine which is the sell leg (higher strike for put spread = buy leg)
      const isCallSpread = a.trade_type === 'CallSpread'
      const sellLeg = isCallSpread
        ? (a.strike_sell < b.strike_sell ? a : b)
        : (a.strike_sell > b.strike_sell ? a : b)
      const buyLeg = sellLeg === a ? b : a

      merged.push({
        ...sellLeg,
        strike_buy: buyLeg.strike_sell,
        realized_pnl: combinedPnl,
        premium_collected: combinedPremium,
        status: sellLeg.status,
        symbol: `${sellLeg.underlying} ${sellLeg.expiry_date} ${sellLeg.strike_sell}/${buyLeg.strike_sell} ${isCallSpread ? 'C' : 'P'} Spread`,
      })
    } else {
      merged.push(a)
    }
  }

  return merged
}

// ─── Stock transactions parser ────────────────────────────────────────────────

function parseTransactions(
  sections: Map<string, SectionData>,
  month: string
): Transaction[] {
  const tradesSection = sections.get('Trades')
  if (!tradesSection) return []

  const transactions: Transaction[] = []

  for (const row of tradesSection.rows) {
    if (row[1] !== 'Stocks') continue
    // DataDiscriminator, Asset Category, Currency, Symbol, Date/Time, Quantity, T.Price, C.Price, Proceeds, Comm/Fee, Basis, Realized P/L, MTM P/L, Code
    const symbol = row[3]
    const dateTime = parseIBKRDate(row[4])
    const qty = parseFloat(row[5]) || 0
    const tPrice = parseFloat(row[6]) || 0
    const proceeds = parseFloat(row[8]) || 0
    const commission = Math.abs(parseFloat(row[9]) || 0)

    if (!symbol || qty === 0) continue

    transactions.push({
      ticker: symbol,
      transaction_type: qty > 0 ? 'buy' : 'sell',
      trade_date: dateTime,
      shares: Math.abs(qty),
      price: Math.abs(tPrice),
      commission,
      total_amount: Math.abs(proceeds),
      broker: 'IBKR',
      source: 'ibkr_import',
    })
  }

  return transactions
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function parseIBKRStatement(csvContent: string): IBKRParsedData {
  const sections = extractSections(csvContent)
  const month = parseStatementMonth(sections)

  const holdings = parseHoldings(sections, month)
  const { dividends, taxMap } = parseDividends(sections, month)
  const options = parseOptions(sections, month)
  const transactions = parseTransactions(sections, month)

  // Build withholding tax summary
  const withholdingTax: { [key: string]: number } = {}
  taxMap.forEach((v, k) => { withholdingTax[k] = v })

  return { month, holdings, dividends, withholdingTax, options, transactions }
}
