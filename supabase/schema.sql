-- ─────────────────────────────────────────────────────────────
-- Joel Income Journal — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────

-- Holdings snapshots (one row per ticker per monthly upload)
CREATE TABLE IF NOT EXISTS holdings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month         TEXT NOT NULL,
  ticker        TEXT NOT NULL,
  name          TEXT,
  shares        NUMERIC NOT NULL DEFAULT 0,
  cost_per_share NUMERIC DEFAULT 0,
  cost_basis    NUMERIC DEFAULT 0,
  broker        TEXT DEFAULT 'IBKR',
  pays_dividend BOOLEAN DEFAULT true,
  dividend_yield           NUMERIC DEFAULT 0,
  dividend_yield_on_cost   NUMERIC DEFAULT 0,
  div_received_cumulative  NUMERIC DEFAULT 0,
  next_payment_date  TEXT,
  next_payment_amount NUMERIC DEFAULT 0,
  ex_dividend_date   TEXT,
  source        TEXT DEFAULT 'ibkr',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, ticker, broker)
);

-- Dividend payments (line-by-line from IBKR statement)
CREATE TABLE IF NOT EXISTS dividend_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  payment_date  DATE NOT NULL,
  amount_gross  NUMERIC NOT NULL,
  withholding_tax NUMERIC DEFAULT 0,
  amount_net    NUMERIC NOT NULL,
  per_share     NUMERIC DEFAULT 0,
  description   TEXT,
  payment_type  TEXT DEFAULT 'ordinary',
  upload_month  TEXT NOT NULL,
  source        TEXT DEFAULT 'ibkr',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Options trades
CREATE TABLE IF NOT EXISTS options_trades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underlying        TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  trade_type        TEXT NOT NULL,
  open_date         DATE,
  expiry_date       DATE,
  strike_sell       NUMERIC,
  strike_buy        NUMERIC,
  contracts         INTEGER DEFAULT 1,
  multiplier        INTEGER DEFAULT 100,
  premium_collected NUMERIC DEFAULT 0,
  open_price        NUMERIC DEFAULT 0,
  close_date        DATE,
  close_price       NUMERIC,
  commission        NUMERIC DEFAULT 0,
  realized_pnl      NUMERIC,
  max_profit        NUMERIC,
  max_loss          NUMERIC,
  status            TEXT DEFAULT 'open',
  notes             TEXT,
  source            TEXT DEFAULT 'manual',
  upload_month      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Stock buy/sell transactions
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker           TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  trade_date       DATE NOT NULL,
  shares           NUMERIC NOT NULL,
  price            NUMERIC NOT NULL,
  commission       NUMERIC DEFAULT 0,
  total_amount     NUMERIC NOT NULL,
  broker           TEXT DEFAULT 'IBKR',
  notes            TEXT,
  source           TEXT DEFAULT 'manual',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Generated YouTube & Substack scripts
CREATE TABLE IF NOT EXISTS generated_scripts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          TEXT NOT NULL,
  script_type    TEXT NOT NULL,
  content        TEXT NOT NULL,
  edited_content TEXT,
  is_finalized   BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Upload audit log
CREATE TABLE IF NOT EXISTS upload_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_type       TEXT NOT NULL,
  month             TEXT NOT NULL,
  filename          TEXT,
  records_processed INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes for common queries ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_holdings_month        ON holdings(month);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker       ON holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_dividends_month       ON dividend_payments(upload_month);
CREATE INDEX IF NOT EXISTS idx_dividends_ticker      ON dividend_payments(ticker);
CREATE INDEX IF NOT EXISTS idx_dividends_date        ON dividend_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_options_status        ON options_trades(status);
CREATE INDEX IF NOT EXISTS idx_options_month         ON options_trades(upload_month);
CREATE INDEX IF NOT EXISTS idx_transactions_ticker   ON transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_scripts_month         ON generated_scripts(month);
