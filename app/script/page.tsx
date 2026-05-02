'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatMonthLabel } from '@/lib/utils'
import { Sparkles, Copy, Download, Save, CheckCircle, Youtube, FileText } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-client'

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID

export default function ScriptPage() {
  const router = useRouter()

  // Guard: redirect non-admin users immediately
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || !ADMIN_USER_ID || uid !== ADMIN_USER_ID) {
        router.replace('/')
      }
    })
  }, [router])
  const [report, setReport] = useState<any>(null)
  const [scripts, setScripts] = useState<any[]>([])
  const [activeScript, setActiveScript] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [scriptType, setScriptType] = useState<'youtube' | 'substack'>('youtube')
  const [userNotes, setUserNotes] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/report').then(r => r.json()).then(d => setReport(d)).catch(() => {})
    fetch('/api/generate-script').then(r => r.json()).then(d => setScripts(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeScript) {
      setEditedContent(activeScript.edited_content || activeScript.content || '')
    }
  }, [activeScript])

  async function generate() {
    if (!report) return
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: report.month,
          type: scriptType,
          userNotes: userNotes || undefined,
          reportData: report,
        }),
      })
      const data = await res.json()
      if (data.content) {
        setActiveScript(data)
        setEditedContent(data.edited_content || data.content)
        // Refresh scripts list
        fetch('/api/generate-script').then(r => r.json()).then(d => setScripts(Array.isArray(d) ? d : []))
      } else if (data.error) {
        setGenError(data.error)
      } else {
        setGenError('No content returned — please try again.')
      }
    } catch (e: any) {
      setGenError(e.message || 'Request failed')
    } finally {
      setGenerating(false)
    }
  }

  async function saveEdit() {
    if (!activeScript?.id) return
    setSaving(true)
    const res = await fetch('/api/generate-script', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeScript.id, edited_content: editedContent }),
    })
    const updated = await res.json()
    setActiveScript(updated)
    setSaving(false)
  }

  async function copyToClipboard() {
    const text = editedContent || activeScript?.content || ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadDoc() {
    const text = editedContent || activeScript?.content || ''
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report?.month_label || 'Income Report'} — ${scriptType === 'youtube' ? 'YouTube Script' : 'Substack Post'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasScript = !!(editedContent || activeScript?.content)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Script Generator</h1>
        <p className="text-gray-400 text-sm mt-1">
          {report?.month_label
            ? `Generate content for ${report.month_label}`
            : 'Upload your monthly data first'}
        </p>
      </div>

      {!report?.combined_total && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-400">
          No report data found. <a href="/upload" className="underline">Upload your IBKR statement</a> first, then come back to generate your script.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Controls */}
        <div className="space-y-4">
          {/* Script Type */}
          <Card title="Script Type">
            <div className="space-y-2">
              <button
                onClick={() => setScriptType('youtube')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${scriptType === 'youtube' ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-[#374151] text-gray-400 hover:text-white'}`}
              >
                <Youtube size={18} />
                <div className="text-left">
                  <p className="text-sm font-medium">YouTube Script</p>
                  <p className="text-xs opacity-60">Full video script with sections</p>
                </div>
              </button>
              <button
                onClick={() => setScriptType('substack')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${scriptType === 'substack' ? 'border-orange-500/50 bg-orange-500/10 text-orange-400' : 'border-[#374151] text-gray-400 hover:text-white'}`}
              >
                <FileText size={18} />
                <div className="text-left">
                  <p className="text-sm font-medium">Substack Post</p>
                  <p className="text-xs opacity-60">Reformatted as written article</p>
                </div>
              </button>
            </div>
          </Card>

          {/* Data summary */}
          {report && (
            <Card title="Report Data">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Month</span>
                  <span className="text-white font-medium">{report.month_label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dividends (net)</span>
                  <span className="text-yellow-400">${report.dividend_net?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Options P&L</span>
                  <span className={report.options_total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ${report.options_total_pnl?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#1f2937] pt-2">
                  <span className="text-gray-400">Combined</span>
                  <span className="text-blue-400 font-bold">${report.combined_total?.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Notes */}
          <Card title="Your Notes (Optional)">
            <textarea
              className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              rows={4}
              placeholder="Add any specific points you want included, e.g. 'Mention that I doubled my BTCI position this month' or 'Include the SPX tariff impact'"
              value={userNotes}
              onChange={e => setUserNotes(e.target.value)}
            />
          </Card>

          <Button
            className="w-full"
            size="lg"
            loading={generating}
            disabled={!report?.combined_total}
            onClick={generate}
          >
            <Sparkles size={16} />
            {generating ? 'Generating...' : `Generate ${scriptType === 'youtube' ? 'YouTube Script' : 'Substack Post'}`}
          </Button>

          {genError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              ⚠️ {genError}
            </div>
          )}

          {/* Previous scripts */}
          {scripts.length > 0 && (
            <Card title="Previous Scripts">
              <div className="space-y-2">
                {scripts.slice(0, 5).map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveScript(s)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${activeScript?.id === s.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-[#374151] hover:border-[#4b5563]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">
                        {formatMonthLabel(s.month)} · {s.script_type}
                      </span>
                      {s.is_finalized && <Badge variant="green">Final</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: Editor */}
        <div className="lg:col-span-2 space-y-4">
          {hasScript ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={scriptType === 'youtube' ? 'red' : 'yellow'}>
                    {scriptType === 'youtube' ? 'YouTube Script' : 'Substack Post'}
                  </Badge>
                  {activeScript?.month && (
                    <span className="text-xs text-gray-500">{formatMonthLabel(activeScript.month)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                    {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadDoc}>
                    <Download size={14} /> Download
                  </Button>
                  <Button variant="secondary" size="sm" loading={saving} onClick={saveEdit}>
                    <Save size={14} /> Save
                  </Button>
                </div>
              </div>

              {/* Editor */}
              <textarea
                ref={textareaRef}
                className="script-editor"
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                spellCheck
              />
              <p className="text-xs text-gray-600">
                {editedContent.split(' ').filter(Boolean).length} words · Click anywhere to edit · Changes saved manually
              </p>
            </>
          ) : (
            <div className="bg-[#111827] border-2 border-dashed border-[#1f2937] rounded-xl h-96 flex items-center justify-center">
              <div className="text-center">
                <Sparkles size={32} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Your script will appear here</p>
                <p className="text-gray-600 text-sm mt-1">
                  {report?.combined_total
                    ? 'Click Generate to create your script'
                    : 'Upload monthly data first'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
