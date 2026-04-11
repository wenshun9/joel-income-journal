-- Migration 001: Add dividend enrichment columns to holdings
-- Run in Supabase SQL Editor if upgrading an existing database

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS dividend_frequency       TEXT,
  ADD COLUMN IF NOT EXISTS annual_dividend_per_share NUMERIC DEFAULT 0;
