// ─── Holdings ────────────────────────────────────────────────────────────────

export interface Holding {
  id?: string
  month: string            // 'YYYY-MM'
  ticker: string
  name: string
  shares: number
  cost_per_share: number
  cost_basis: number
  current_price?: number   // live from Yahoo Finance
  current_value?: number   // shares × current_price
  unrealized_pnl?: number
  unrealized_pnl_pct?: number
  broker: 'IBKR' | 'Longbridge' | 'Both'
  pays_dividend: boolean
  dividend_yield?: number
  dividend_yield_on_cost?: number
  div_received_cumulative?: number
  next_payment_date?: string
  next_payment_amount?: number
  ex_dividend_date?: string
  annualised_yield?: number // calculated: ann. yield based on recent distributions
  source: 'ibkr' | 'snowball' | 'manual'
  created_at?: string
}

// ─── Dividends ────────────────────────────────────────────────────────────────

export interface DividendPayment {
  id?: string
  ticker: string
  payment_date: string     // ISO date
  amount_gross: number
  withholding_tax: number
  amount_net: number
  per_share: number
  description: string
  payment_type: 'ordinary' | 'pil'   // pil = payment in lieu
  upload_month: string     // 'YYYY-MM'
  source: 'ibkr' | 'snowball' | 'manual'
  created_at?: string
}

export interface MonthlyDividendSummary {
  ticker: string
  name?: string
  total_gross: number
  total_net: number
  total_tax: number
  payment_count: number
  pct_of_total: number
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Unknown'
  annualised_yield?: number
  broker?: string
}

// ─── Options ─────────────────────────────────────────────────────────────────

export type OptionTradeType = 'CSP' | 'CoveredCall' | 'PutSpread' | 'CallSpread' | 'LEAPS'
export type OptionStatus = 'open' | 'closed' | 'expired' | 'assigned'

export interface OptionTrade {
  id?: string
  underlying: string
  symbol: string           // e.g. "SOXL 27MAR26 50 P"
  trade_type: OptionTradeType
  open_date: string
  expiry_date: string
  strike_sell: number
  strike_buy?: number      // spreads only
  contracts: number
  multiplier: number       // 100 for equity options, 100 for SPX
  premium_collected: number
  open_price: number       // premium per share
  close_date?: string
  close_price?: number
  commission?: number
  realized_pnl?: number
  max_profit?: number      // spreads: (sell_premium - buy_premium) × contracts × multiplier
  max_loss?: number        // spreads: (spread_width - net_credit) × contracts × multiplier
  status: OptionStatus
  notes?: string
  source: 'manual' | 'ibkr_import'
  upload_month?: string
  created_at?: string
  updated_at?: string
}

export interface OptionsMonthSummary {
  individual_pnl: number
  spx_pnl: number
  total_pnl: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  spx_trades: OptionTrade[]
  individual_trades: OptionTrade[]
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionType = 'buy' | 'sell'

export interface Transaction {
  id?: string
  ticker: string
  transaction_type: TransactionType
  trade_date: string
  shares: number
  price: number
  commission?: number
  total_amount: number
  broker: 'IBKR' | 'Longbridge'
  notes?: string
  source: 'manual' | 'ibkr_import'
  created_at?: string
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

export interface MonthlyReport {
  month: string            // 'YYYY-MM'
  month_label: string      // 'March 2026'
  dividend_net: number
  dividend_gross: number
  dividend_tax: number
  options_individual_pnl: number
  options_spx_pnl: number
  options_total_pnl: number
  combined_total: number
  prev_month_combined?: number
  dividend_breakdown: MonthlyDividendSummary[]
  options_trades: OptionTrade[]
  spx_trades: OptionTrade[]
}

// ─── Script ───────────────────────────────────────────────────────────────────

export interface GeneratedScript {
  id?: string
  month: string
  script_type: 'youtube' | 'substack'
  content: string
  edited_content?: string
  is_finalized: boolean
  created_at?: string
  updated_at?: string
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean
  month: string
  records_processed: number
  errors?: string[]
  summary?: {
    holdings?: number
    dividends?: number
    options?: number
    transactions?: number
  }
}

// ─── Live Price ───────────────────────────────────────────────────────────────

export interface LivePrice {
  ticker: string
  price: number
  change: number
  change_pct: number
  timestamp: number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardData {
  current_month: string
  portfolio_value: number
  portfolio_cost: number
  portfolio_unrealized_pnl: number
  portfolio_unrealized_pnl_pct: number
  ytd_dividends_net: number
  ytd_options_pnl: number
  ytd_combined: number
  current_month_dividends_net: number
  current_month_options_pnl: number
  current_month_combined: number
  open_options_count: number
  upcoming_dividends: UpcomingDividend[]
  open_options: OptionTrade[]
}

export interface UpcomingDividend {
  ticker: string
  name?: string
  ex_date: string
  payment_date: string
  estimated_amount: number
  frequency: string
}

// ─── Snowball CSV row (after parsing) ────────────────────────────────────────

export interface SnowballRow {
  ticker: string
  name: string
  shares: number
  currency: string
  cost_basis: number
  current_value: number
  current_price: number
  broker: string
  sector: string
  dividends_annual: number
  dividends_per_share: number
  dividend_yield: number
  dividend_yield_on_cost: number
  div_received: number
  tax: number
  unrealized_pnl: number
  next_payment_date: string
  next_payment: number
  ex_dividend_date: string
}

// ─── IBKR Parsed Sections ────────────────────────────────────────────────────

export interface IBKRParsedData {
  month: string
  holdings: Holding[]
  dividends: DividendPayment[]
  withholdingTax: { [key: string]: number }  // date+ticker → amount
  options: OptionTrade[]
  transactions: Transaction[]
}
