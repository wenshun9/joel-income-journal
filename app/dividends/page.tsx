'use client'
import { useEffect, useState } from 'react'
import { Card, StatCard } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatMonthLabel } from '@/lib/utils'
import { DollarSign, TrendingUp } from 'lucide-react'

export default function DividendsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'summary' | 'detail'>('summary')

  useEffect(() => {
    fetch('/api/dividends')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-500">Loading dividends...</div>

  const summary = data?.summary || []
  const payments = data?.payments || []
  const totals = data?.totals || { gross: 0, net: 0, tax: 0 }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dividends</h1>
          <p className="text-gray-400 text-sm mt-1">
            {data?.month ? formatMonthLabel(data.month) : 'No data'} · {summary.length} holdings
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('summary')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'summary' ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-400 hover:text-white'}`}>Summary</button>
          <button onClick={() => setView('detail')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'detail' ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-400 hover:text-white'}`}>All Payments</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Net Income" value={formatCurrency(totals.net)} color="gold" icon={<DollarSign size={16}/>} />
        <StatCard label="Gross Income" value={formatCurrency(totals.gross)} color="white" />
        <StatCard label="Withholding Tax (30%)" value={formatCurrency(totals.tax)} color="red" />
        <StatCard label="Holdings Paying" value={summary.length.toString()} color="blue" icon={<TrendingUp size={16}/>} />
      </div>

      {view === 'summary' ? (
        <Card title="Dividend Breakdown by Ticker">
          {summary.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">No dividend data for this period</p>
              <a href="/upload" className="text-blue-400 text-sm">Upload your IBKR statement →</a>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full data-table">
                <thead>
                  <tr className="bg-[#0a0e1a]">
                    <th>Ticker</th>
                    <th className="text-right">Net (USD)</th>
                    <th className="text-right">Gross (USD)</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">% of Total</th>
                    <th>Frequency</th>
                    <th className="text-right">Est. Ann. Yield</th>
                    <th className="text-center">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s: any) => (
                    <tr key={s.ticker}>
                      <td>
                        <div>
                          <span className="font-semibold text-white">{s.ticker}</span>
                          {s.name && s.name !== s.ticker && (
                            <p className="text-xs text-gray-500 truncate max-w-[160px]">{s.name}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-right font-mono text-sm text-yellow-400 font-semibold">
                        {formatCurrency(s.total_net)}
                      </td>
                      <td className="text-right font-mono text-sm text-gray-300">
                        {formatCurrency(s.total_gross)}
                      </td>
                      <td className="text-right font-mono text-sm text-red-400">
                        {formatCurrency(s.total_tax)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${s.pct_of_total}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right">{s.pct_of_total.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        <Badge variant={s.frequency === 'Weekly' ? 'blue' : s.frequency === 'Monthly' ? 'green' : 'gray'}>
                          {s.frequency}
                        </Badge>
                      </td>
                      <td className="text-right font-mono text-sm">
                        {s.annualised_yield
                          ? <span className="text-green-400">{s.annualised_yield.toFixed(1)}%</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="text-center text-sm text-gray-400">{s.payment_count}x</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0a0e1a]">
                    <td className="px-4 py-3 font-semibold text-white">TOTAL</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-yellow-400">{formatCurrency(totals.net)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">{formatCurrency(totals.gross)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-400">{formatCurrency(totals.tax)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card title="All Dividend Payments" subtitle={`${payments.length} individual payments`}>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full data-table">
              <thead>
                <tr className="bg-[#0a0e1a]">
                  <th>Date</th>
                  <th>Ticker</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">Per Share</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-sm text-gray-300">{formatDate(p.payment_date)}</td>
                    <td className="font-semibold text-white">{p.ticker}</td>
                    <td className="text-right font-mono text-sm text-gray-300">{formatCurrency(p.amount_gross)}</td>
                    <td className="text-right font-mono text-sm text-red-400">{formatCurrency(p.withholding_tax)}</td>
                    <td className="text-right font-mono text-sm font-semibold text-yellow-400">{formatCurrency(p.amount_net)}</td>
                    <td className="text-right font-mono text-xs text-gray-500">
                      {p.per_share > 0 ? `$${p.per_share.toFixed(4)}` : '—'}
                    </td>
                    <td>
                      <Badge variant={p.payment_type === 'pil' ? 'yellow' : 'green'}>
                        {p.payment_type === 'pil' ? 'PIL' : 'Ordinary'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
