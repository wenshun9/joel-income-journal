'use client'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal, Field, Input, Select } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/Card'
import { formatCurrency, formatPct, formatShares, getPnlColor, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, TrendingUp, TrendingDown, Sparkles, ChevronDown } from 'lucide-react'

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'IBKR' | 'Longbridge'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ticker: '', shares: '', price: '', date: '', broker: 'IBKR', type: 'buy', notes: '' })
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState<string | null>(null)
  const [months, setMonths] = useState<{ value: string; label: string }[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  // Load available months once, prepend a "Latest" merged option
  useEffect(() => {
    fetch('/api/months')
      .then(r => r.json())
      .then((data: { value: string; label: string }[]) => {
        const withLatest = [
          { value: 'latest', label: 'Latest (all sources)' },
          ...(Array.isArray(data) ? data : []),
        ]
        setMonths(withLatest)
        setSelectedMonth('latest') // default to smart-merged view
      })
      .catch(() => {
        setMonths([{ value: 'latest', label: 'Latest (all sources)' }])
        setSelectedMonth('latest')
      })
  }, [])

  async function load(month?: string) {
    setLoading(true)
    const m = month || selectedMonth
    const url = m && m !== 'latest' ? `/api/holdings?month=${m}` : '/api/holdings'
    const data = await fetch(url).then(r => r.json()).catch(() => [])
    setHoldings(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    if (selectedMonth) load(selectedMonth)
  }, [selectedMonth])

  const filtered = filter === 'all' ? holdings : holdings.filter(h => h.broker === filter || h.broker === 'Both')

  const totalValue = filtered.reduce((s: number, h: any) => s + (h.current_value || 0), 0)
  const totalCost = filtered.reduce((s: number, h: any) => s + (h.cost_basis || 0), 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  async function enrichDividends() {
    setEnriching(true)
    setEnrichResult(null)
    try {
      const res = await fetch('/api/enrich-dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // For "latest" merged view, enrich without a specific month (backend picks latest IBKR)
        body: JSON.stringify({ month: selectedMonth === 'latest' ? undefined : selectedMonth }),
      })
      const data = await res.json()
      if (data.success) {
        setEnrichResult(`✓ Updated ${data.updated} holdings from stockanalysis.com`)
        load(selectedMonth)
      } else {
        setEnrichResult(`Error: ${data.error}`)
      }
    } catch {
      setEnrichResult('Error connecting to enrichment service')
    }
    setEnriching(false)
    setTimeout(() => setEnrichResult(null), 5000)
  }

  async function saveTransaction() {
    if (!form.ticker || !form.shares || !form.price) return
    setSaving(true)
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: form.ticker.toUpperCase(),
        transaction_type: form.type,
        trade_date: form.date || new Date().toISOString().split('T')[0],
        shares: parseFloat(form.shares),
        price: parseFloat(form.price),
        broker: form.broker,
        notes: form.notes,
      }),
    })
    setSaving(false)
    setAddOpen(false)
    setForm({ ticker: '', shares: '', price: '', date: '', broker: 'IBKR', type: 'buy', notes: '' })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Holdings</h1>
          <p className="text-gray-400 text-sm mt-1">
            {filtered.length} positions · Live prices
            {selectedMonth === 'latest' && ' · Merged from latest IBKR + Snowball data'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
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
          <Button variant="ghost" size="sm" onClick={() => load(selectedMonth)}><RefreshCw size={14} /></Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={enrichDividends}
            loading={enriching}
            title="Refresh dividend data from stockanalysis.com"
          >
            <Sparkles size={14} /> Refresh Dividends
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Transaction</Button>
        </div>
      </div>
      {enrichResult && (
        <div className={`text-sm px-4 py-2 rounded-lg ${enrichResult.startsWith('✓') ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
          {enrichResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Portfolio Value" value={formatCurrency(totalValue)} color="white" />
        <StatCard label="Total Cost" value={formatCurrency(totalCost)} color="white" />
        <StatCard
          label="Unrealized P&L"
          value={formatCurrency(totalPnl)}
          sub={formatPct(totalPnlPct)}
          color={totalPnl >= 0 ? 'green' : 'red'}
        />
        <StatCard label="Positions" value={filtered.length.toString()} color="blue" />
      </div>

      {/* Filter */}
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
          <div className="text-center py-8 text-gray-500">Loading holdings...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">No holdings found</p>
            <a href="/upload" className="text-blue-400 text-sm hover:text-blue-300">Upload your IBKR statement →</a>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full data-table">
              <thead>
                <tr className="bg-[#0a0e1a]">
                  <th>Ticker</th>
                  <th>Shares</th>
                  <th className="text-right">Cost/Share</th>
                  <th className="text-right">Live Price</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">P&L</th>
                  <th className="text-right">Yield</th>
                  <th>Broker</th>
                  <th>Next Payment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h: any) => (
                  <tr key={h.id || h.ticker}>
                    <td>
                      <div>
                        <span className="font-semibold text-white">{h.ticker}</span>
                        {h.name && h.name !== h.ticker && (
                          <p className="text-xs text-gray-500 truncate max-w-[140px]">{h.name}</p>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-sm">{formatShares(h.shares)}</td>
                    <td className="text-right font-mono text-sm">{formatCurrency(h.cost_per_share)}</td>
                    <td className="text-right">
                      <div>
                        <span className="font-mono text-sm text-white">{formatCurrency(h.current_price || 0)}</span>
                        {h.live_change_pct !== undefined && (
                          <div className={`flex items-center justify-end gap-0.5 text-xs ${h.live_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {h.live_change_pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(h.live_change_pct).toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-mono text-sm">{formatCurrency(h.current_value || 0)}</td>
                    <td className="text-right">
                      <div className={`font-mono text-sm ${getPnlColor(h.unrealized_pnl || 0)}`}>
                        {formatCurrency(h.unrealized_pnl || 0)}
                        <div className="text-xs">{formatPct(h.unrealized_pnl_pct || 0)}</div>
                      </div>
                    </td>
                    <td className="text-right text-sm">
                      {h.dividend_yield > 0
                        ? <span className="text-yellow-400">{(h.dividend_yield * 100).toFixed(1)}%</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td>
                      <Badge variant={h.broker === 'Longbridge' ? 'purple' : h.broker === 'Both' ? 'blue' : 'gray'}>
                        {h.broker}
                      </Badge>
                    </td>
                    <td className="text-sm">
                      {h.next_payment_date ? (
                        <div>
                          <span className="text-white">{formatDate(h.next_payment_date)}</span>
                          {h.next_payment_amount > 0 && (
                            <div className="text-xs text-yellow-400">{formatCurrency(h.next_payment_amount)}</div>
                          )}
                        </div>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Transaction Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Transaction">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </Select>
            </Field>
            <Field label="Broker" required>
              <Select value={form.broker} onChange={e => setForm({ ...form, broker: e.target.value })}>
                <option value="IBKR">IBKR</option>
                <option value="Longbridge">Longbridge</option>
              </Select>
            </Field>
          </div>
          <Field label="Ticker" required>
            <Input
              placeholder="e.g. BTCI"
              value={form.ticker}
              onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shares" required>
              <Input
                type="number" step="0.0001" min="0"
                placeholder="e.g. 50"
                value={form.shares}
                onChange={e => setForm({ ...form, shares: e.target.value })}
              />
            </Field>
            <Field label="Price per Share" required>
              <Input
                type="number" step="0.01" min="0"
                placeholder="e.g. 32.55"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </Field>
          </div>
          {form.shares && form.price && (
            <div className="text-xs text-gray-400 bg-[#1f2937] rounded-lg p-2">
              Total: <span className="text-white font-medium">
                {formatCurrency(parseFloat(form.shares || '0') * parseFloat(form.price || '0'))}
              </span>
            </div>
          )}
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <Input
              placeholder="Optional"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={saveTransaction}>Save Transaction</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
