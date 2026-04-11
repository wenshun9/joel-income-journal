import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generateYouTubeScript, generateSubstackPost } from '@/lib/claude'
import { MonthlyReport } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month, type = 'youtube', userNotes, reportData } = body

    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminId = process.env.NEXT_PUBLIC_ADMIN_USER_ID
    if (!adminId || user.id !== adminId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use provided report data or fetch it
    let report: MonthlyReport = reportData
    if (!report) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const res = await fetch(`${appUrl}/api/report?month=${month}`)
      if (!res.ok) return NextResponse.json({ error: 'Could not fetch report data' }, { status: 500 })
      report = await res.json()
    }

    let content = ''
    if (type === 'youtube') {
      content = await generateYouTubeScript(report, userNotes)
    } else if (type === 'substack') {
      // Check if YouTube script exists for this month
      const { data: existing } = await supabase
        .from('generated_scripts')
        .select('edited_content, content')
        .eq('month', month)
        .eq('script_type', 'youtube')
        .order('created_at', { ascending: false })
        .limit(1)

      const ytScript = existing?.[0]?.edited_content || existing?.[0]?.content
      content = await generateSubstackPost(report, ytScript)
    }

    // Save to database
    const { data, error } = await supabase
      .from('generated_scripts')
      .insert({
        month,
        script_type: type,
        content,
        is_finalized: false,
      })
      .select()
      .single()

    if (error) {
      // Return content even if save fails
      return NextResponse.json({ content, saved: false })
    }

    return NextResponse.json({ ...data, saved: true })
  } catch (err) {
    console.error('Script generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

// GET: fetch saved scripts for a month
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const type = searchParams.get('type')
  const supabase = createServerClient()

  let query = supabase
    .from('generated_scripts')
    .select('*')
    .order('created_at', { ascending: false })

  if (month) query = query.eq('month', month)
  if (type) query = query.eq('script_type', type)

  const { data, error } = await query.limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// PATCH: save edited script
export async function PATCH(request: NextRequest) {
  try {
    const { id, edited_content, is_finalized } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('generated_scripts')
      .update({
        edited_content,
        is_finalized: is_finalized ?? false,
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
