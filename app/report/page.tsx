'use client'
import { useEffect, useState } from 'react'
import { Card, StatCard } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatMonthLabel, getPnlColor } from '@/lib/utils'
import { FileText, ChevronDown } from 'lucide-react'
import Link from 'next/link'

export default function ReportPage() {
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<{ value: string; label: string }[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  // Load available months on mount
  useEffect(() => {
    fetch('/api/months')
      .then(r => r.json())
      .then((data: { value: string; label: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setMonths(data)
          setSelectedMonth(data[0].value) // default to most recent
        }
      })
      .catch(() => {})
  }, [])

  // Load report whenever selected month changes
  useEffect(() => {
    if (!selectedMonth) return
    setLoading(true)
    fetch(`/api/report?month=${selectedMonth}`)
      .then(r => r.json())
      .then(d => { setReport(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedMonth])

  if (loading) return <div className="text-center py-16 text-gray-500">Building report...</div>

  if (!report || !report.combined_total) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 mb-4">No report data yet</p>
        <Link href="/upload" className="text-blue-400 hover:text-blue-300">Upload your monthly data →</Link>
      </div>
    )
  }

  const spxWins = (report.spx_trades || []).filter((t: any) => (t.realized_pnl || 0) > 0).length
  const spxTotal = (report.spx_trades || []).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{report.month_label} Income Report</h1>
          <p className="text-gray-400 text-sm mt-1">Combined dividends + options trading</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Month selector */}
          {months.length > 1 && (
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="appearance-none bg-[#1f2937] border border-[#374151] text-white text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          <Link href="/script">
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <FileText size={14} />
              Generate Script
            </button>
          </Link>
        </div>
      </div>

      {/* Headline Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Dividends (Net after 30% WHT)" value={formatCurrency(report.dividend_net)} color="gold" />
        <StatCard label="Gross Dividends" value={formatCurrency(report.dividend_gross)} sub={`Tax: ${formatCurrency(report.dividend_tax)}`} color="white" />
        <StatCard label="Options P&L" value={formatCurrency(report.options_total_pnl)} color={report.options_total_pnl >= 0 ? 'green' : 'red'} sub={`SPX: ${formatCurrency(report.options_spx_pnl)}`} />
        <StatCard label="Combined Total" value={formatCurrency(report.combined_total)} color="blue"
          sub={report.prev_month_combined ? `vs ${formatCurrency(report.prev_month_combined)} last month` : undefined}
        />
      </div>

      {/* Dividend Breakdown */}
      <Card
        title="Section 1 — Dividend Income"
        subtitle={`${report.dividend_breakdown?.length || 0} holdings · Net after 30% withholding tax`}
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-[#0a0e1a]">
                <th>#</th>
                <th>Ticker</th>
                <th>Name</th>
                <th className="text-right">Net (USD)</th>
                <th className="text-right">% Income</th>
                <th>Freq</th>
                <th className="text-right">Est. Ann. Yield</th>
              </tr>
            </thead>
            <tbody>
              {(report.dividend_breakdown || []).map((d: any, i: number) => (
                <tr key={d.ticker}>
                  <td className="text-gray-500 text-xs">{i + 1}</td>
                  <td className="font-semibold text-white">{d.ticker}</td>
                  <td className="text-sm text-gray-300 max-w-[200px] truncate">{d.name}</td>
                  <td className="text-right font-mono text-sm font-semibold text-yellow-400">{formatCurrency(d.total_net)}</td>
                  <td className="text-right text-sm text-gray-400">{d.pct_of_total.toFixed(1)}%</td>
                  <td>
                    <Badge variant={d.frequency === 'Weekly' ? 'blue' : 'green'}>{d.frequency}</Badge>
                  </td>
                  <td className="text-right font-mono text-sm">
                    {d.annualised_yield
                      ? <span className="text-green-400">{d.annualised_yield.toFixed(1)}%</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#0a0e1a]">
                <td colSpan={3} className="px-4 py-3 font-bold text-white">TOTAL ({report.dividend_breakdown?.length} holdings)</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-yellow-400">{formatCurrency(report.dividend_net)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Options — Individual */}
      <Card
        title="Section 2A — Individual Options"
        subtitle={`${(report.options_trades || []).filter((t: any) => t.underlying !== 'SPXW' && t.underlying !== 'SPX').length} trades`}
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-[#0a0e1a]">
                <th>Underlying</th>
                <th>Symbol</th>
                <th>Type</th>
                <th className="text-right">Premium</th>
                <th>Opened</th>
                <th>Closed</th>
                <th className="text-right">Realized P&L</th>
              </tr>
            </thead>
            <tbody>
              {(report.options_trades || [])
                .filter((t: any) => t.underlying !== 'SPXW' && t.underlying !== 'SPX')
                .sort((a: any, b: any) => Math.abs(b.realized_pnl || 0) - Math.abs(a.realized_pnl || 0))
                .map((t: any) => (
                <tr key={t.id}>
                  <td className="font-semibold text-white">{t.underlying}</td>
                  <td className="text-xs font-mono text-gray-400">{t.symbol}</td>
                  <td><Badge variant={t.trade_type === 'CSP' ? 'green' : 'blue'}>{t.trade_type}</Badge></td>
                  <td className="text-right font-mono text-sm text-green-400">{formatCurrency(t.premium_collected)}</td>
                  <td className="text-sm text-gray-300">{formatDate(t.open_date)}</td>
                  <td className="text-sm text-gray-300">{formatDate(t.close_date)}</td>
                  <td className={`text-right font-mono text-sm font-semibold ${getPnlColor(t.realized_pnl || 0)}`}>
                    {formatCurrency(t.realized_pnl || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#0a0e1a]">
                <td colSpan={6} className="px-4 py-3 font-bold text-white">TOTAL</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${getPnlColor(report.options_individual_pnl)}`}>
                  {formatCurrency(report.options_individual_pnl)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* SPX Spreads */}
      {(report.spx_trades || []).length > 0 && (
        <Card
          title="Section 2B — SPX Credit Spreads"
          subtitle={`${spxWins}/${spxTotal} wins (${spxTotal > 0 ? ((spxWins / spxTotal) * 100).toFixed(0) : 0}% win rate)`}
        >
          <div className="overflow-x-auto -mx-5">
            <table className="w-full data-table">
              <thead>
                <tr className="bg-[#0a0e1a]">
                  <th>Dates</th>
                  <th>Spread</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th className="text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {(report.spx_trades || []).map((t: any) => {
                  const win = (t.realized_pnl || 0) > 0
                  return (
                    <tr key={t.id}>
                      <td className="text-sm text-gray-300">{formatDate(t.open_date)}–{formatDate(t.close_date || t.expiry_date)}</td>
                      <td className="text-xs font-mono text-gray-300">{t.symbol}</td>
                      <td><Badge variant={t.trade_type === 'CallSpread' ? 'blue' : 'purple'}>{t.trade_type.includes('Call') ? 'Call' : 'Put'}</Badge></td>
                      <td><Badge variant={win ? 'green' : 'red'}>{win ? '✓ Win' : '✗ Loss'}</Badge></td>
                      <td className={`text-right font-mono text-sm font-semibold ${getPnlColor(t.realized_pnl || 0)}`}>
                        {formatCurrency(t.realized_pnl || 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#0a0e1a]">
                  <td colSpan={4} className="px-4 py-3 font-bold text-white">
                    {spxWins} Wins / {spxTotal - spxWins} Loss
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${getPnlColor(report.options_spx_pnl)}`}>
                    {formatCurrency(report.options_spx_pnl)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Combined Summary */}
      <Card title="Section 3 — Combined Summary">
        <div className="space-y-3">
          {[
            { label: 'Dividend Income (Net after 30% WHT)', value: report.dividend_net, color: 'text-yellow-400' },
            { label: 'Gross Dividend (Before WHT)', value: report.dividend_gross, color: 'text-gray-300' },
            { label: 'Options P&L — Individual', value: report.options_individual_pnl, color: getPnlColor(report.options_individual_pnl) },
            { label: 'Options P&L — SPX Credit Spreads', value: report.options_spx_pnl, color: getPnlColor(report.options_spx_pnl) },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-[#1f2937]">
              <span className="text-sm text-gray-400">{row.label}</span>
              <span className={`font-mono font-semibold ${row.color}`}>{formatCurrency(row.value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3 border-t-2 border-blue-600/30 mt-2">
            <span className="font-bold text-white text-lg">TOTAL COMBINED INCOME</span>
            <span className="font-mono font-bold text-blue-400 text-xl">{formatCurrency(report.combined_total)}</span>
          </div>
          {report.prev_month_combined > 0 && (
            <p className="text-xs text-gray-500 text-right">
              vs {formatCurrency(report.prev_month_combined)} previous month
              ({report.combined_total > report.prev_month_combined ? '+' : ''}
              {(((report.combined_total - report.prev_month_combined) / report.prev_month_combined) * 100).toFixed(1)}%)
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
