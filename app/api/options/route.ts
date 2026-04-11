import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { OptionTrade } from '@/types'

// ─── GET: fetch options (all or by month/status) ───────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const status = searchParams.get('status') // 'open' | 'closed' | 'all'
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase.from('options_trades').select('*').eq('user_id', user.id).order('open_date', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (month) {
    query = query.eq('upload_month', month)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Auto-mark expired options (past expiry date, still 'open')
  const toExpire = (data || []).filter(t =>
    t.status === 'open' &&
    t.expiry_date &&
    new Date(t.expiry_date) < today
  )

  if (toExpire.length > 0) {
    // Fire-and-forget — update expired options in DB
    await supabase
      .from('options_trades')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', toExpire.map(t => t.id))

    // Return with corrected status in this response
    const result = (data || []).map(t =>
      toExpire.find(e => e.id === t.id) ? { ...t, status: 'expired' } : t
    )
    return NextResponse.json(result)
  }

  return NextResponse.json(data || [])
}

// ─── POST: create new options trade ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Build symbol string
    const symbol = body.symbol || buildSymbol(body)

    // Calculate max profit / max loss for spreads
    let maxProfit: number | undefined
    let maxLoss: number | undefined
    if (body.trade_type === 'CallSpread' || body.trade_type === 'PutSpread') {
      if (body.strike_buy && body.strike_sell && body.premium_collected) {
        const spreadWidth = Math.abs(body.strike_buy - body.strike_sell)
        const netCredit = body.premium_collected / (body.contracts * 100)
        maxProfit = body.premium_collected
        maxLoss = (spreadWidth - netCredit) * body.contracts * 100
      }
    }

    // Determine month from open_date
    const month = body.open_date
      ? body.open_date.slice(0, 7)
      : new Date().toISOString().slice(0, 7)

    const { data, error } = await supabase
      .from('options_trades')
      .insert({
        underlying: body.underlying,
        symbol,
        trade_type: body.trade_type,
        open_date: body.open_date,
        expiry_date: body.expiry_date,
        strike_sell: body.strike_sell,
        strike_buy: body.strike_buy || null,
        contracts: body.contracts || 1,
        multiplier: body.multiplier || 100,
        premium_collected: body.premium_collected || 0,
        open_price: body.open_price || (body.premium_collected / ((body.contracts || 1) * 100)),
        status: 'open',
        notes: body.notes || null,
        source: 'manual',
        upload_month: month,
        max_profit: maxProfit || null,
        max_loss: maxLoss || null,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ─── PATCH: close a trade or update it ────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, close_price, close_date, notes, status } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch existing trade (scoped to user)
    const { data: trade, error: fetchErr } = await supabase
      .from('options_trades')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (fetchErr || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })

    let realized_pnl = trade.realized_pnl
    let newStatus = status || trade.status

    if (close_price !== undefined) {
      // LEAPS (long call): profit when price goes UP → (close - open)
      // Selling strategies: profit when price goes DOWN → (open - close)
      const isLong = trade.trade_type === 'LEAPS'
      realized_pnl = isLong
        ? (close_price - trade.open_price) * trade.contracts * trade.multiplier - (trade.commission || 0)
        : (trade.open_price - close_price) * trade.contracts * trade.multiplier - (trade.commission || 0)
      newStatus = 'closed'
    }

    const { data, error } = await supabase
      .from('options_trades')
      .update({
        close_price: close_price ?? trade.close_price,
        close_date: close_date || close_price ? (close_date || new Date().toISOString().split('T')[0]) : trade.close_date,
        realized_pnl,
        status: newStatus,
        notes: notes ?? trade.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ─── DELETE: remove a trade or clear all ──────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const clearAll = searchParams.get('clearAll')

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (clearAll === 'true') {
    // Delete all of this user's trades only
    const { error } = await supabase.from('options_trades').delete().eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, cleared: true })
  }

  if (!id) return NextResponse.json({ error: 'id or clearAll required' }, { status: 400 })
  const { error } = await supabase.from('options_trades').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function buildSymbol(body: Partial<OptionTrade>): string {
  if (body.trade_type === 'CallSpread' || body.trade_type === 'PutSpread') {
    const type = body.trade_type === 'CallSpread' ? 'C' : 'P'
    return `${body.underlying} ${body.expiry_date || ''} ${body.strike_sell}/${body.strike_buy} ${type} Spread`
  }
  if (body.trade_type === 'LEAPS') {
    return `${body.underlying} ${body.expiry_date || ''} ${body.strike_sell} C (LEAPS)`
  }
  const type = body.trade_type === 'CSP' ? 'P' : 'C'
  const expiry = body.expiry_date || ''
  return `${body.underlying} ${expiry} ${body.strike_sell} ${type}`
}
