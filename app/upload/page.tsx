'use client'
import { useState, useRef } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { formatMonthLabel } from '@/lib/utils'
import { format } from 'date-fns'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface UploadResult {
  success: boolean
  month?: string
  summary?: Record<string, number>
  error?: string
}

function UploadCard({
  title, description, accept, endpoint, icon, color
}: {
  title: string; description: string; accept: string
  endpoint: string; icon: React.ReactNode; color: string
}) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentMonth = format(new Date(), 'yyyy-MM')

  async function handleFile(file: File) {
    setStatus('uploading')
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('month', currentMonth)

    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.success) {
        setStatus('success')
        setResult(data)
      } else {
        setStatus('error')
        setResult({ success: false, error: data.error || 'Upload failed' })
      }
    } catch (e) {
      setStatus('error')
      setResult({ success: false, error: 'Network error' })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`bg-[#111827] border-2 rounded-xl p-6 transition-all ${
        dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-[#1f2937]'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>
      </div>

      <div className="mt-4">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />

        {status === 'idle' && (
          <div className="border-2 border-dashed border-[#374151] rounded-lg p-6 text-center">
            <Upload className="mx-auto text-gray-500 mb-2" size={24} />
            <p className="text-sm text-gray-400 mb-3">Drag & drop your CSV file here</p>
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Browse File
            </Button>
          </div>
        )}

        {status === 'uploading' && (
          <div className="flex items-center gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-400">Parsing and uploading...</span>
          </div>
        )}

        {status === 'success' && result && (
          <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-sm font-medium text-green-400">
                Successfully imported {result.month ? formatMonthLabel(result.month) : ''} data
              </span>
            </div>
            {result.summary && (
              <div className="flex gap-4 mt-2">
                {Object.entries(result.summary).map(([k, v]) => v > 0 && (
                  <div key={k} className="text-xs text-gray-400">
                    <span className="text-white font-medium">{v}</span> {k}
                  </div>
                ))}
              </div>
            )}
            <button
              className="text-xs text-gray-500 hover:text-gray-300 mt-3"
              onClick={() => { setStatus('idle'); setResult(null) }}
            >
              Upload another file
            </button>
          </div>
        )}

        {status === 'error' && result && (
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-sm font-medium text-red-400">Upload failed</span>
            </div>
            <p className="text-xs text-gray-400">{result.error}</p>
            <button
              className="text-xs text-blue-400 hover:text-blue-300 mt-2"
              onClick={() => { setStatus('idle'); setResult(null) }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Data</h1>
        <p className="text-gray-400 text-sm mt-1">
          Upload your monthly statements. Data is automatically parsed — no manual entry needed.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <UploadCard
          title="IBKR Activity Statement"
          description="Export from IBKR → Reports → Activity Statement (CSV). Imports dividends, options trades, and all positions."
          accept=".csv"
          endpoint="/api/upload/ibkr"
          icon={<FileText size={20} className="text-blue-400" />}
          color="bg-blue-500/20"
        />
        <UploadCard
          title="Snowball Analytics Export"
          description="Export from Snowball → Holdings CSV. Adds Longbridge positions and dividend metadata."
          accept=".csv"
          endpoint="/api/upload/snowball"
          icon={<FileText size={20} className="text-yellow-400" />}
          color="bg-yellow-500/20"
        />
      </div>

      <Card title="How it works">
        <div className="space-y-4">
          {[
            {
              step: '1',
              title: 'Export IBKR Activity Statement',
              desc: 'In IBKR: Reports → Tax Documents → Activity Statement. Select the month, export as CSV. This gives you dividends, all options trades, and your positions.',
            },
            {
              step: '2',
              title: 'Export Snowball Holdings CSV',
              desc: 'In Snowball Analytics, go to your portfolio and export as CSV. This adds your Longbridge positions and enriches dividend data.',
            },
            {
              step: '3',
              title: 'Upload both files above',
              desc: 'The app parses both files automatically. Dividends, options P&L, and holdings are all populated. No double counting — the app reconciles both sources.',
            },
            {
              step: '4',
              title: 'Generate your monthly report and script',
              desc: 'Go to Report to review your month, then Script to generate your YouTube and Substack content with one click.',
            },
          ].map(item => (
            <div key={item.step} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-400">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
