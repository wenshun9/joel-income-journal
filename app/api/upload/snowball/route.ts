import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseSnowballCSV } from '@/lib/parsers/snowball'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const month = formData.get('month') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const csvContent = await file.text()
    const parsed = parseSnowballCSV(csvContent, month || undefined)
    const { month: parsedMonth, holdings } = parsed
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (holdings.length === 0) {
      return NextResponse.json({ error: 'No holdings found in file' }, { status: 400 })
    }

    // Upsert holdings — merge Snowball data with existing IBKR data
    // Snowball is the source for: dividend yields, next payment dates, names
    // We don't overwrite IBKR cost basis for IBKR holdings
    for (const h of holdings) {
      if (h.broker === 'Longbridge') {
        // Longbridge-only: full upsert
        await supabase
          .from('holdings')
          .upsert({
            month: parsedMonth,
            ticker: h.ticker,
            name: h.name,
            shares: h.shares,
            cost_per_share: h.cost_per_share,
            cost_basis: h.cost_basis,
            broker: 'Longbridge',
            pays_dividend: h.pays_dividend,
            dividend_yield: h.dividend_yield,
            dividend_yield_on_cost: h.dividend_yield_on_cost,
            div_received_cumulative: h.div_received_cumulative,
            next_payment_date: h.next_payment_date || null,
            next_payment_amount: h.next_payment_amount || null,
            ex_dividend_date: h.ex_dividend_date || null,
            source: 'snowball',
            user_id: user.id,
          }, { onConflict: 'month,ticker,broker' })
      } else {
        // IBKR / Both: update dividend metadata on existing IBKR row, don't overwrite positions
        const { data: existing } = await supabase
          .from('holdings')
          .select('id')
          .eq('user_id', user.id)
          .eq('month', parsedMonth)
          .eq('ticker', h.ticker)
          .eq('broker', 'IBKR')
          .maybeSingle()

        if (existing) {
          await supabase
            .from('holdings')
            .update({
              name: h.name,
              pays_dividend: h.pays_dividend,
              dividend_yield: h.dividend_yield,
              dividend_yield_on_cost: h.dividend_yield_on_cost,
              div_received_cumulative: h.div_received_cumulative,
              next_payment_date: h.next_payment_date || null,
              next_payment_amount: h.next_payment_amount || null,
              ex_dividend_date: h.ex_dividend_date || null,
            })
            .eq('id', existing.id)
        } else {
          // IBKR holding not yet uploaded — store from Snowball
          await supabase
            .from('holdings')
            .upsert({
              month: parsedMonth,
              ticker: h.ticker,
              name: h.name,
              shares: h.shares,
              cost_per_share: h.cost_per_share,
              cost_basis: h.cost_basis,
              broker: h.broker,
              pays_dividend: h.pays_dividend,
              dividend_yield: h.dividend_yield,
              dividend_yield_on_cost: h.dividend_yield_on_cost,
              div_received_cumulative: h.div_received_cumulative,
              next_payment_date: h.next_payment_date || null,
              next_payment_amount: h.next_payment_amount || null,
              ex_dividend_date: h.ex_dividend_date || null,
              source: 'snowball',
              user_id: user.id,
            }, { onConflict: 'month,ticker,broker' })
        }
      }
    }

    await supabase.from('upload_log').insert({
      upload_type: 'snowball',
      month: parsedMonth,
      filename: file.name,
      records_processed: holdings.length,
      user_id: user.id,
    })

    return NextResponse.json({
      success: true,
      month: parsedMonth,
      records_processed: holdings.length,
      summary: { holdings: holdings.length },
    })
  } catch (err) {
    console.error('Snowball upload error:', err)
    return NextResponse.json(
      { error: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
