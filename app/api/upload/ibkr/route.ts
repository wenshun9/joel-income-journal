import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseIBKRStatement } from '@/lib/parsers/ibkr'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const csvContent = await file.text()
    const parsed = parseIBKRStatement(csvContent)
    const { month, holdings, dividends, options, transactions } = parsed
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let holdingsCount = 0, dividendsCount = 0, optionsCount = 0, txCount = 0
    const errors: string[] = []

    // ─── Upsert Holdings ───────────────────────────────────────────────────────
    if (holdings.length > 0) {
      for (const h of holdings) {
        // Check if a row already exists with a proper name (from Snowball or enrichment)
        const { data: existing } = await supabase
          .from('holdings')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('month', h.month)
          .eq('ticker', h.ticker)
          .eq('broker', h.broker)
          .maybeSingle()

        const preservedName = (existing?.name && existing.name !== h.ticker)
          ? existing.name   // keep the better name already in DB
          : h.ticker        // fallback to ticker

        const { error } = await supabase
          .from('holdings')
          .upsert({
            month: h.month,
            ticker: h.ticker,
            name: preservedName,
            shares: h.shares,
            cost_per_share: h.cost_per_share,
            cost_basis: h.cost_basis,
            broker: h.broker,
            pays_dividend: h.pays_dividend,
            source: 'ibkr',
            user_id: user.id,
          }, { onConflict: 'month,ticker,broker' })

        if (!error) holdingsCount++
        else errors.push(`Holding ${h.ticker}: ${error.message}`)
      }
    }

    // ─── Insert Dividends (delete month first to avoid dupes) ─────────────────
    if (dividends.length > 0) {
      await supabase
        .from('dividend_payments')
        .delete()
        .eq('user_id', user.id)
        .eq('upload_month', month)
        .eq('source', 'ibkr')

      const { error } = await supabase
        .from('dividend_payments')
        .insert(dividends.map(d => ({
          ticker: d.ticker,
          payment_date: d.payment_date,
          amount_gross: d.amount_gross,
          withholding_tax: d.withholding_tax,
          amount_net: d.amount_net,
          per_share: d.per_share,
          description: d.description,
          payment_type: d.payment_type,
          upload_month: d.upload_month,
          source: 'ibkr',
          user_id: user.id,
        })))
      if (error) errors.push(`Dividends: ${error.message}`)
      else dividendsCount = dividends.length
    }

    // ─── Upsert Options (by symbol + upload_month, skip existing manual ones) ──
    if (options.length > 0) {
      // Only import options that don't already exist as manual entries
      const { data: existingManual } = await supabase
        .from('options_trades')
        .select('symbol')
        .eq('user_id', user.id)
        .eq('upload_month', month)
        .eq('source', 'manual')

      const manualSymbols = new Set((existingManual || []).map(r => r.symbol))

      const toInsert = options.filter(o => !manualSymbols.has(o.symbol))

      if (toInsert.length > 0) {
        // Remove existing IBKR imports for this month first
        await supabase
          .from('options_trades')
          .delete()
          .eq('user_id', user.id)
          .eq('upload_month', month)
          .eq('source', 'ibkr_import')

        const { error } = await supabase
          .from('options_trades')
          .insert(toInsert.map(o => ({
            underlying: o.underlying,
            symbol: o.symbol,
            trade_type: o.trade_type,
            open_date: o.open_date || null,
            expiry_date: o.expiry_date || null,
            strike_sell: o.strike_sell,
            strike_buy: o.strike_buy || null,
            contracts: o.contracts,
            multiplier: o.multiplier,
            premium_collected: o.premium_collected,
            open_price: o.open_price,
            close_date: o.close_date || null,
            close_price: o.close_price || null,
            commission: o.commission,
            realized_pnl: o.realized_pnl || null,
            status: o.status,
            source: 'ibkr_import',
            upload_month: o.upload_month,
            user_id: user.id,
          })))
        if (error) errors.push(`Options: ${error.message}`)
        else optionsCount = toInsert.length
      }
    }

    // ─── Insert Transactions (skip if already manually entered) ───────────────
    if (transactions.length > 0) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('ticker, trade_date')
        .eq('user_id', user.id)
        .gte('trade_date', `${month}-01`)
        .lte('trade_date', `${month}-31`)
        .eq('source', 'manual')

      const existingKeys = new Set((existing || []).map(r => `${r.ticker}|${r.trade_date}`))
      const toInsert = transactions.filter(
        t => !existingKeys.has(`${t.ticker}|${t.trade_date}`)
      )

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('transactions')
          .insert(toInsert.map(t => ({
            ticker: t.ticker,
            transaction_type: t.transaction_type,
            trade_date: t.trade_date,
            shares: t.shares,
            price: t.price,
            commission: t.commission,
            total_amount: t.total_amount,
            broker: 'IBKR',
            source: 'ibkr_import',
            user_id: user.id,
          })))
        if (error) errors.push(`Transactions: ${error.message}`)
        else txCount = toInsert.length
      }
    }

    // ─── Log upload ───────────────────────────────────────────────────────────
    await supabase.from('upload_log').insert({
      upload_type: 'ibkr',
      month,
      filename: file.name,
      records_processed: holdingsCount + dividendsCount + optionsCount + txCount,
      user_id: user.id,
    })

    return NextResponse.json({
      success: true,
      month,
      records_processed: holdingsCount + dividendsCount + optionsCount + txCount,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        holdings: holdingsCount,
        dividends: dividendsCount,
        options: optionsCount,
        transactions: txCount,
      },
    })
  } catch (err) {
    console.error('IBKR upload error:', err)
    return NextResponse.json(
      { error: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
