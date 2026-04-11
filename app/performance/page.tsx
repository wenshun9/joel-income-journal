'use client'
import { useEffect, useState } from 'react'
import { Card, StatCard } from '@/components/ui/Card'
import { formatCurrency, formatPct, formatShares, getPnlColor } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, Award, DollarSign } from 'lucide-react'

interface HoldingReturn {
  id?: string
  ticker: string
  name?: string
  shares: number
  cost_basis: number
  cost_per_share: number
  current_price: number
  current_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  live_change_pct?: number
  total_dividends: number
  div_source: 'snowball' | 'uploaded'
  total_return: number
  total_return_pct: number
  dividend_return_pct: number
  broker: string
}

interface Summary {
  portfolio_cost: number
  portfolio_value: number
  portfolio_unrealized_pnl: number
  portfolio_all_dividends: number
  portfolio_total_return: number
  portfolio_total_return_pct: number
}

type SortKey = 'total_return_pct' | 'total_return' | 'total_dividends' | 'unrealized_pnl_pct' | 'ticker'
type SortDir = 'asc' | 'desc'

export default function PerformancePage() {
  const [holdings, setHoldings] = useState<HoldingReturn[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total_return_pct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filter, setFilter] = useState<'all' | 'IBKR' | 'Longbridge'>('all')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/total-return')
      const data = await res.json()
      if (data.holdings) {
        setHoldings(data.holdings)
        setSummary(data.summary)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = filter === 'all' ? holdings : holdings.filter(h => h.broker === filter || h.broker === 'Both')

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker)
    return dir * ((a[sortKey] || 0) - (b[sortKey] || 0))
  })

  // Best & worst performers
  const withReturn = sorted.filter(h => h.cost_basis > 0)
  const best  = [...withReturn].sort((a, b) => b.total_return_pct - a.total_return_pct)[0]
  const worst = [...withReturn].sort((a, b) => a.total_return_pct - b.total_return_pct)[0]

  // Max absolute total_return_pct for bar scaling
  const maxPct = Math.max(...withReturn.map(h => Math.abs(h.total_return_pct)), 1)

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-600 ml-1">↕</span>
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function ThSort({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) {
    return (
      <th
        className={`cursor-pointer select-none hover:text-white transition-colors ${right ? 'text-right' : ''}`}
        onClick={() => handleSort(k)}
      >
        {children}<SortIcon k={k} />
      </th>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Total Return</h1>
          <p className="text-gray-400 text-sm mt-1">
            Capital gains + all dividends received since tracking began
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1f2937] text-gray-400 hover:text-white text-sm transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary stat cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Total Return $"
            value={formatCurrency(summary.portfolio_total_return)}
            sub={formatPct(summary.portfolio_total_return_pct)}
            color={summary.portfolio_total_return >= 0 ? 'green' : 'red'}
          />
          <StatCard
            label="Portfolio Value"
            value={formatCurrency(summary.portfolio_value)}
            sub={`Cost: ${formatCurrency(summary.portfolio_cost)}`}
            color="white"
          />
          <StatCard
            label="Unrealized P&L"
            value={formatCurrency(summary.portfolio_unrealized_pnl)}
            sub={`${formatPct(summary.portfolio_cost > 0 ? (summary.portfolio_unrealized_pnl / summary.portfolio_cost) * 100 : 0)} capital`}
            color={summary.portfolio_unrealized_pnl >= 0 ? 'green' : 'red'}
          />
          <StatCard
            label="All Dividends Received"
            value={formatCurrency(summary.portfolio_all_dividends)}
            sub={`${formatPct(summary.portfolio_cost > 0 ? (summary.portfolio_all_dividends / summary.portfolio_cost) * 100 : 0)} income`}
            color="gold"
          />
          {best && (
            <StatCard
              label="Best Performer"
              value={best.ticker}
              sub={`${formatPct(best.total_return_pct)} total return`}
              color="green"
            />
          )}
          {worst && (
            <StatCard
              label="Needs Most Work"
              value={worst.ticker}
              sub={`${formatPct(worst.total_return_pct)} total return`}
              color="red"
            />
          )}
        </div>
      )}

      {/* Return breakdown legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/70" />
          <span>Capital gain (price appreciation)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-500/70" />
          <span>Income (dividends received)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/70" />
          <span>Negative return</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-gray-700 pl-4">
          <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 rounded">SB</span>
          <span>Cumulative from Snowball (most accurate)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] bg-gray-500/20 text-gray-500 border border-gray-500/30 px-1 rounded">↑</span>
          <span>Sum of uploaded statements only</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'IBKR', 'Longbridge'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All Brokers' : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Calculating returns…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No holdings data</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full data-table">
              <thead>
                <tr className="bg-[#0a0e1a]">
                  <ThSort k="ticker">Ticker</ThSort>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Cost Basis</th>
                  <th className="text-right">Curr. Value</th>
                  <ThSort k="unrealized_pnl_pct" right>Capital P&L</ThSort>
                  <ThSort k="total_dividends" right>Dividends</ThSort>
                  <ThSort k="total_return" right>Total Return $</ThSort>
                  <ThSort k="total_return_pct" right>Total Return %</ThSort>
                  <th>Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => {
                  const capitalPct   = h.cost_basis > 0 ? (h.unrealized_pnl / h.cost_basis) * 100 : 0
                  const divPct       = h.dividend_return_pct
                  const totalPct     = h.total_return_pct
                  const isPositive   = totalPct >= 0

                  // Bar widths (proportional to maxPct, each component fills its share)
                  const barTotal     = Math.min(Math.abs(totalPct) / maxPct * 100, 100)
                  const capitalShare = Math.abs(totalPct) > 0 ? Math.abs(capitalPct) / Math.abs(totalPct) : 0
                  const divShare     = Math.abs(totalPct) > 0 ? Math.abs(divPct) / Math.abs(totalPct) : 0

                  return (
                    <tr key={h.id || h.ticker}>
                      <td>
                        <div>
                          <span className="font-semibold text-white">{h.ticker}</span>
                          {h.name && h.name !== h.ticker && (
                            <p className="text-xs text-gray-500 truncate max-w-[130px]">{h.name}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-right font-mono text-sm">{formatShares(h.shares)}</td>
                      <td className="text-right font-mono text-sm text-gray-300">{formatCurrency(h.cost_basis)}</td>
                      <td className="text-right font-mono text-sm text-white">
                        {formatCurrency(h.current_value)}
                        {h.live_change_pct !== undefined && (
                          <div className={`flex items-center justify-end gap-0.5 text-xs ${h.live_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {h.live_change_pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(h.live_change_pct).toFixed(2)}%
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <div className={`font-mono text-sm ${getPnlColor(h.unrealized_pnl)}`}>
                          {formatCurrency(h.unrealized_pnl)}
                          <div className="text-xs">{formatPct(capitalPct)}</div>
                        </div>
                      </td>
                      <td className="text-right">
                        {h.total_dividends > 0 ? (
                          <div className="font-mono text-sm text-yellow-400">
                            {formatCurrency(h.total_dividends)}
                            <div className="flex items-center justify-end gap-1 text-xs text-yellow-500/70">
                              {formatPct(divPct)}
                              {h.div_source === 'snowball' ? (
                                <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 rounded font-sans">SB</span>
                              ) : (
                                <span className="text-[9px] bg-gray-500/20 text-gray-500 border border-gray-500/30 px-1 rounded font-sans">↑</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className={`font-mono text-sm font-semibold ${getPnlColor(h.total_return)}`}>
                          {formatCurrency(h.total_return)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className={`font-mono text-sm font-bold ${getPnlColor(h.total_return_pct)}`}>
                          {formatPct(h.total_return_pct)}
                        </span>
                      </td>
                      {/* Visual bar breakdown */}
                      <td className="min-w-[100px]">
                        <div className="w-full h-4 bg-[#1f2937] rounded overflow-hidden flex">
                          {isPositive ? (
                            <>
                              {capitalPct > 0 && (
                                <div
                                  className="h-full bg-blue-500/70"
                                  style={{ width: `${barTotal * capitalShare}%` }}
                                  title={`Capital: ${formatPct(capitalPct)}`}
                                />
                              )}
                              {divPct > 0 && (
                                <div
                                  className="h-full bg-yellow-500/70"
                                  style={{ width: `${barTotal * divShare}%` }}
                                  title={`Dividends: ${formatPct(divPct)}`}
                                />
                              )}
                              {capitalPct < 0 && (
                                <div
                                  className="h-full bg-red-500/40"
                                  style={{ width: `${barTotal * capitalShare}%` }}
                                  title={`Capital loss offset: ${formatPct(capitalPct)}`}
                                />
                              )}
                            </>
                          ) : (
                            <div
                              className="h-full bg-red-500/60"
                              style={{ width: `${barTotal}%` }}
                              title={`Total: ${formatPct(totalPct)}`}
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {capitalPct >= 0
                            ? `${formatPct(capitalPct)} cap / ${formatPct(divPct)} div`
                            : `${formatPct(capitalPct)} cap + ${formatPct(divPct)} div`
                          }
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Footnote */}
      <p className="text-xs text-gray-600 text-center">
        Total Return = Unrealized Capital Gain + All Dividends Received ·
        <span className="text-purple-500/70"> SB</span> = Snowball cumulative total (all-time, most accurate) ·
        <span className="text-gray-500"> ↑</span> = only covers months you've uploaded statements for
      </p>
    </div>
  )
}
