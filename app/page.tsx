'use client'
import { useEffect, useState } from 'react'
import { StatCard, Card } from '@/components/ui/Card'
import { Badge, TradeTypeBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatPct, getPnlColor, formatMonthLabel } from '@/lib/utils'
import { DollarSign, TrendingUp, BarChart2, ChevronDown } from 'lucide-react'

export default function Dashboard() {
  const [report, setReport] = useState<any>(null)
  const [openOptions, setOpenOptions] = useState<any[]>([])
  const [holdings, setHoldings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<{ value: string; label: string }[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  // Load available months once
  useEffect(() => {
    fetch('/api/months')
      .then(r => r.json())
      .then((data: { value: string; label: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setMonths(data)
          setSelectedMonth(data[0].value)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  // Holdings: always fetch latest smart merge — portfolio value is never month-scoped
  useEffect(() => {
    fetch('/api/holdings').then(r => r.json())
      .then(data => setHoldings(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Income report + open options: re-fetch when month changes
  useEffect(() => {
    if (!selectedMonth) return
    setLoading(true)
    Promise.all([
      fetch(`/api/report?month=${selectedMonth}`).then(r => r.json()).catch(() => null),
      fetch('/api/options?status=open').then(r => r.json()).catch(() => []),
    ]).then(([reportData, optData]) => {
      setReport(reportData)
      setOpenOptions(optData || [])
      setLoading(false)
    })
  }, [selectedMonth])

  const portfolioValue = holdings.reduce((s: number, h: any) => s + (h.current_value || 0), 0)
  const portfolioCost = holdings.reduce((s: number, h: any) => s + (h.cost_basis || 0), 0)
  const portfolioPnl = portfolioValue - portfolioCost
  const portfolioPnlPct = portfolioCost > 0 ? (portfolioPnl / portfolioCost) * 100 : 0

  // Upcoming dividends from holdings
  const upcoming = holdings
    .filter((h: any) => h.next_payment_date)
    .sort((a: any, b: any) => new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime())
    .slice(0, 6)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const hasData = report && report.combined_total > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {hasData ? formatMonthLabel(report.month) : 'No data yet — upload your IBKR statement to get started'}
          </p>
        </div>
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
      </div>

      {!hasData && (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-6 text-center">
          <p className="text-blue-400 font-medium mb-2">Welcome to Joel Income Journal</p>
          <p className="text-gray-400 text-sm mb-4">Upload your IBKR monthly statement and Snowball CSV to see your dashboard.</p>
          <a href="/upload" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Upload Data
          </a>
        </div>
      )}

      {/* Income Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Dividends (Net)"
          value={formatCurrency(report?.dividend_net || 0)}
          sub={`Gross: ${formatCurrency(report?.dividend_gross || 0)}`}
          color="gold"
          icon={<DollarSign size={16} />}
        />
        <StatCard
          label="Options P&L"
          value={formatCurrency(report?.options_total_pnl || 0)}
          sub={`SPX: ${formatCurrency(report?.options_spx_pnl || 0)}`}
          color={(report?.options_total_pnl || 0) >= 0 ? 'green' : 'red'}
          icon={<BarChart2 size={16} />}
        />
        <StatCard
          label="Combined Total"
          value={formatCurrency(report?.combined_total || 0)}
          sub={report?.prev_month_combined
            ? `Prev: ${formatCurrency(report.prev_month_combined)}`
            : undefined}
          color="blue"
        />
        <StatCard
          label="Portfolio Value"
          value={formatCurrency(portfolioValue)}
          sub={`${portfolioPnl >= 0 ? '+' : ''}${formatCurrency(portfolioPnl)} (${formatPct(portfolioPnlPct)})`}
          color={portfolioPnl >= 0 ? 'green' : 'red'}
          icon={<TrendingUp size={16} />}
        />
      </div>

      {/* Income breakdown bar */}
      {hasData && (
        <Card title="Monthly Income Breakdown">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Dividends (Net)</span>
                <span>{formatCurrency(report.dividend_net)} ({report.combined_total > 0 ? ((report.dividend_net / report.combined_total) * 100).toFixed(0) : 0}%)</span>
              </div>
              <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full"
                  style={{ width: `${report.combined_total > 0 ? (report.dividend_net / report.combined_total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Options P&L</span>
                <span>{formatCurrency(report.options_total_pnl)} ({report.combined_total > 0 ? ((report.options_total_pnl / report.combined_total) * 100).toFixed(0) : 0}%)</span>
              </div>
              <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full"
                  style={{ width: `${report.combined_total > 0 ? Math.max(0, (report.options_total_pnl / report.combined_total)) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Dividends */}
        <Card title="Upcoming Dividends" subtitle="From next payment dates in holdings">
          {upcoming.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No upcoming payment dates found — click Refresh Dividends on Holdings page</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((h: any) => (
                <div key={h.ticker + h.next_payment_date} className="flex items-center justify-between py-2 border-b border-[#1f2937] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1f2937] flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-300">{h.ticker.slice(0, 2)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{h.name && h.name !== h.ticker ? h.name : h.ticker}</p>
                      <p className="text-xs text-gray-500">{formatDate(h.next_payment_date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {h.next_payment_amount > 0 && (
                      <p className="text-sm font-medium text-yellow-400">{formatCurrency(h.next_payment_amount)}</p>
                    )}
                    {h.ex_dividend_date && (
                      <p className="text-xs text-gray-500">Ex: {formatDate(h.ex_dividend_date)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Open Options */}
        <Card title="Open Positions" subtitle={`${openOptions.length} active option trades`}>
          {openOptions.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No open options positions</p>
          ) : (
            <div className="space-y-2">
              {openOptions.slice(0, 6).map((o: any) => {
                const today = new Date()
                const expiry = o.expiry_date ? new Date(o.expiry_date) : null
                const dte = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                return (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-[#1f2937] last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{o.underlying}</span>
                        <TradeTypeBadge type={o.trade_type} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{o.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-400">{formatCurrency(o.premium_collected)}</p>
                      {dte !== null && (
                        <p className={`text-xs ${dte <= 7 ? 'text-red-400' : dte <= 14 ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {dte}d to expiry
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              {openOptions.length > 6 && (
                <a href="/options" className="block text-center text-xs text-blue-400 hover:text-blue-300 pt-2">
                  View all {openOptions.length} positions →
                </a>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
