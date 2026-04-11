import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { formatMonthLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Returns all months that have data (dividends, options, or holdings)
export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [divResult, optResult, holdResult] = await Promise.all([
    supabase.from('dividend_payments').select('upload_month').eq('user_id', user.id),
    supabase.from('options_trades').select('upload_month').eq('user_id', user.id),
    supabase.from('holdings').select('month').eq('user_id', user.id),
  ])

  const months = new Set([
    ...(divResult.data || []).map((d: any) => d.upload_month).filter(Boolean),
    ...(optResult.data || []).map((o: any) => o.upload_month).filter(Boolean),
    ...(holdResult.data || []).map((h: any) => h.month).filter(Boolean),
  ])

  const sorted = Array.from(months)
    .sort((a, b) => (b as string).localeCompare(a as string))
    .map(m => ({ value: m, label: formatMonthLabel(m as string) }))

  return NextResponse.json(sorted)
}
