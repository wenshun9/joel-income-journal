'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import { Card, StatCard } from '@/components/ui/Card'
import { formatCurrency, formatMonthLabel } from '@/lib/utils'
import { TrendingUp, DollarSign, BarChart2, Calendar } from 'lucide-react'

interface MonthEntry {
  month: string
  month_label: string
  month_short: string
  dividend_net: number
  dividend_gross: number
  dividend_tax: number
  options_pnl: number
  options_spx_pnl: number
  options_individual_pnl: number
  combined: number
  div_count: number
  opt_trade_count: number
  opt_win_count: number
}

// Custom tooltip for the chart
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = (payload[0]?.value || 0) + (payload[1]?.value || 0)
  return (
    <div className="bg-[#1a2235] border border-[#2d3748] rounded-lg p-3 shadow-xl text-sm">
      <p className="text-white font-semibold mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.fill }} />
            {p.name}
          </span>
          <span className="font-mono" style={{ color: p.fill }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-[#2d3748] mt-2 pt-2 flex justify-between">
        <span className="text-gray-400">Total</span>
        <span className="font-mono font-bold text-blue-400">{formatCurrency(total)}</span>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [history, setHistory] = useState<MonthEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(d => { setHistory(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading history...</p>
        </div>
      </div>
    )
  }

  if (!history.length) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 mb-4">No historical data yet</p>
        <a href="/upload" className="text-blue-400 hover:text-blue-300">Upload your monthly data →</a>
      </div>
    )
  }

  // Stats
  const totalCombined = history.reduce((s, m) => s + m.combined, 0)
  const totalDividends = history.reduce((s, m) => s + m.dividend_net, 0)
  const totalOptions = history.reduce((s, m) => s + m.options_pnl, 0)
  const avgMonthly = totalCombined / history.length
  const bestMonth = history.reduce((best, m) => m.combined > best.combined ? m : best, history[0])
  const currentYear = new Date().getFullYear()
  const ytd = history
    .filter(m => m.month.startsWith(String(currentYear)))
    .reduce((s, m) => s + m.combined, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Income History</h1>
        <p className="text-gray-400 text-sm mt-1">
          {history.length} month{history.length !== 1 ? 's' : ''} of data · {history[0]?.month_label} → {history[history.length - 1]?.month_label}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={`${currentYear} YTD`}
          value={formatCurrency(ytd)}
          sub={`${history.filter(m => m.month.startsWith(String(currentYear))).length} months`}
          color="blue"
          icon={<Calendar size={16} />}
        />
        <StatCard
          label="Monthly Average"
          value={formatCurrency(avgMonthly)}
          sub={`over ${history.length} months`}
          color="white"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Total Dividends"
          value={formatCurrency(totalDividends)}
          sub={`Avg ${formatCurrency(totalDividends / history.length)}/mo`}
          color="gold"
          icon={<DollarSign size={16} />}
        />
        <StatCard
          label="Total Options P&L"
          value={formatCurrency(totalOptions)}
          sub={`Best: ${bestMonth.month_short} (${formatCurrency(bestMonth.combined)})`}
          color={totalOptions >= 0 ? 'green' : 'red'}
          icon={<BarChart2 size={16} />}
        />
      </div>

      {/* Bar chart */}
      <Card title="Monthly Income Breakdown" subtitle="Dividends (net) + Options P&L by month">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="month_short"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend
                formatter={(value) => <span style={{ color: '#9ca3af', fontSize: 12 }}>{value}</span>}
              />
              <Bar dataKey="dividend_net" name="Dividends (Net)" fill="#facc15" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={48} />
              <Bar dataKey="options_pnl" name="Options P&L" fill="#4ade80" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Monthly table */}
      <Card title="Month-by-Month Breakdown">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-[#0a0e1a]">
                <th>Month</th>
                <th className="text-right">Dividends (Net)</th>
                <th className="text-right">Dividends (Gross)</th>
                <th className="text-right">Options P&L</th>
                <th className="text-right">SPX</th>
                <th className="text-right">Individual</th>
                <th className="text-right">Combined</th>
                <th className="text-right">Opt Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((m) => {
                const winRate = m.opt_trade_count > 0
                  ? ((m.opt_win_count / m.opt_trade_count) * 100).toFixed(0)
                  : '—'
                const isCurrentYear = m.month.startsWith(String(currentYear))
                return (
                  <tr key={m.month} className={isCurrentYear ? '' : 'opacity-60'}>
                    <td className="font-medium text-white">{m.month_label}</td>
                    <td className="text-right font-mono text-yellow-400">{formatCurrency(m.dividend_net)}</td>
                    <td className="text-right font-mono text-gray-400 text-xs">{formatCurrency(m.dividend_gross)}</td>
                    <td className={`text-right font-mono ${m.options_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(m.options_pnl)}
                    </td>
                    <td className={`text-right font-mono text-sm ${m.options_spx_pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {formatCurrency(m.options_spx_pnl)}
                    </td>
                    <td className={`text-right font-mono text-sm ${m.options_individual_pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {formatCurrency(m.options_individual_pnl)}
                    </td>
                    <td className="text-right font-mono font-bold text-blue-400">{formatCurrency(m.combined)}</td>
                    <td className="text-right text-sm text-gray-400">
                      {m.opt_trade_count > 0 ? `${winRate}% (${m.opt_win_count}/${m.opt_trade_count})` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#0a0e1a]">
                <td className="px-4 py-3 font-bold text-white">ALL TIME</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-yellow-400">{formatCurrency(totalDividends)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-400">{formatCurrency(history.reduce((s, m) => s + m.dividend_gross, 0))}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${totalOptions >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totalOptions)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${history.reduce((s, m) => s + m.options_spx_pnl, 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(history.reduce((s, m) => s + m.options_spx_pnl, 0))}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${history.reduce((s, m) => s + m.options_individual_pnl, 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(history.reduce((s, m) => s + m.options_individual_pnl, 0))}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-blue-400">{formatCurrency(totalCombined)}</td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {(() => {
                    const tot = history.reduce((s, m) => s + m.opt_trade_count, 0)
                    const wins = history.reduce((s, m) => s + m.opt_win_count, 0)
                    return tot > 0 ? `${((wins / tot) * 100).toFixed(0)}% (${wins}/${tot})` : '—'
                  })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
