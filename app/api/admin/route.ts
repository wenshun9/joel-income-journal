import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// One-time patch endpoint to fix options with null realized_pnl
// For closed options: net proceeds (premium_collected - buyback_cost) = realized P&L
// premium_collected in DB = abs(net_proceeds), commission is separately stored
export async function POST() {
  const supabase = createServerClient()

  // Fetch all closed options with null realized_pnl
  const { data: trades, error } = await supabase
    .from('options_trades')
    .select('*')
    .eq('status', 'closed')
    .is('realized_pnl', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!trades?.length) return NextResponse.json({ message: 'No trades to patch', patched: 0 })

  // For each trade, calculate best-estimate realized_pnl
  const updates: Array<{ id: string; realized_pnl: number }> = []

  for (const t of trades) {
    let pnl: number | null = null

    // Method 1: If we have both open_price and close_price (bought back)
    if (t.open_price > 0 && t.close_price !== null && t.close_price !== undefined) {
      pnl = (t.open_price - t.close_price) * t.contracts * t.multiplier - (t.commission || 0)
    }
    // Method 2: If only close_price = 0 (expired worthless), full premium retained
    else if (t.close_price === 0 || t.close_price === null) {
      if (t.premium_collected > 0) {
        pnl = t.premium_collected - (t.commission || 0)
      }
    }
    // Method 3: premium_collected = net proceeds already (fallback)
    else if (t.premium_collected > 0) {
      pnl = t.premium_collected - (t.commission || 0)
    }

    if (pnl !== null) {
      updates.push({ id: t.id, realized_pnl: Math.round(pnl * 100) / 100 })
    }
  }

  // Batch update in chunks
  let patched = 0
  for (const upd of updates) {
    const { error: updErr } = await supabase
      .from('options_trades')
      .update({ realized_pnl: upd.realized_pnl })
      .eq('id', upd.id)
    if (!updErr) patched++
  }

  return NextResponse.json({
    message: `Patched ${patched} of ${trades.length} trades`,
    patched,
    total: trades.length,
    sample: updates.slice(0, 5),
  })
}
