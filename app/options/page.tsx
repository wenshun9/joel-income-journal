'use client'
import { useEffect, useState } from 'react'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal, Field, Input, Select } from '@/components/ui/Modal'
import { Badge, StatusBadge, TradeTypeBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, getPnlColor } from '@/lib/utils'
import { Plus, X, Trash2 } from 'lucide-react'

const emptyForm = {
  underlying: '', trade_type: 'CSP', open_date: '', expiry_date: '',
  strike_sell: '', strike_buy: '', contracts: '1', premium_collected: '',
  notes: '',
}

export default function OptionsPage() {
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [addOpen, setAddOpen] = useState(false)
  const [closeModal, setCloseModal] = useState<any>(null)
  const [closePrice, setClosePrice] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('/api/options?status=all').then(r => r.json()).catch(() => [])
    setTrades(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openTrades = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status !== 'open')
  const displayed = tab === 'open' ? openTrades : closedTrades

  const closedPnl = closedTrades.reduce((s: number, t: any) => s + (t.realized_pnl || 0), 0)
  const spxPnl = closedTrades.filter(t => t.underlying === 'SPXW' || t.underlying === 'SPX').reduce((s: number, t: any) => s + (t.realized_pnl || 0), 0)
  const wins = closedTrades.filter(t => (t.realized_pnl || 0) > 0).length
  // Selling strategies collect premium; LEAPS spend premium (cost basis)
  const openSellTrades = openTrades.filter(t => t.trade_type !== 'LEAPS')
  const openLeaps = openTrades.filter(t => t.trade_type === 'LEAPS')
  const totalPremium = openSellTrades.reduce((s: number, t: any) => s + (t.premium_collected || 0), 0)
  const totalLeapsCost = openLeaps.reduce((s: number, t: any) => s + (t.premium_collected || 0), 0)

  async function saveTrade() {
    if (!form.underlying || !form.expiry_date || !form.strike_sell) return
    setSaving(true)
    await fetch('/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        underlying: form.underlying.toUpperCase(),
        strike_sell: parseFloat(form.strike_sell),
        strike_buy: form.strike_buy ? parseFloat(form.strike_buy) : undefined,
        contracts: parseInt(form.contracts),
        premium_collected: parseFloat(form.premium_collected),
        multiplier: 100,
      }),
    })
    setSaving(false)
    setAddOpen(false)
    setForm(emptyForm)
    load()
  }

  async function closeTrade() {
    if (!closeModal || !closePrice) return
    setSaving(true)
    await fetch('/api/options', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: closeModal.id,
        close_price: parseFloat(closePrice),
        close_date: new Date().toISOString().split('T')[0],
      }),
    })
    setSaving(false)
    setCloseModal(null)
    setClosePrice('')
    load()
  }

  async function deleteTrade(id: string) {
    if (!confirm('Delete this trade?')) return
    await fetch(`/api/options?id=${id}`, { method: 'DELETE' })
    load()
  }

  async function clearAllTrades() {
    const confirmed = confirm(
      `This will permanently delete ALL ${trades.length} options trades and start fresh.\n\nAre you sure? This cannot be undone.`
    )
    if (!confirmed) return
    setClearingAll(true)
    try {
      await fetch('/api/options?clearAll=true', { method: 'DELETE' })
      load()
    } finally {
      setClearingAll(false)
    }
  }

  const isSpread = form.trade_type === 'CallSpread' || form.trade_type === 'PutSpread'
  const isLeaps = form.trade_type === 'LEAPS'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Options Tracker</h1>
          <p className="text-gray-400 text-sm mt-1">{openTrades.length} open · {closedTrades.length} closed</p>
        </div>
        <div className="flex gap-2">
          {trades.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllTrades}
              loading={clearingAll}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              <Trash2 size={14} /> Clear All
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> New Trade</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Realized P&L" value={formatCurrency(closedPnl)} color={closedPnl >= 0 ? 'green' : 'red'} />
        <StatCard label="SPX Spreads P&L" value={formatCurrency(spxPnl)} color={spxPnl >= 0 ? 'green' : 'red'} />
        <StatCard
          label="Win Rate"
          value={closedTrades.length > 0 ? `${((wins / closedTrades.length) * 100).toFixed(0)}%` : '—'}
          sub={`${wins}/${closedTrades.length} trades`}
          color="blue"
        />
        {openLeaps.length > 0 ? (
          <StatCard
            label="Open Premium / LEAPS Cost"
            value={formatCurrency(totalPremium)}
            sub={`LEAPS cost basis: ${formatCurrency(totalLeapsCost)}`}
            color="gold"
          />
        ) : (
          <StatCard label="Open Premium" value={formatCurrency(totalPremium)} sub={`${openSellTrades.length} sell positions`} color="gold" />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('open')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'open' ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-400 hover:text-white'}`}>
          Open ({openTrades.length})
        </button>
        <button onClick={() => setTab('closed')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'closed' ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-400 hover:text-white'}`}>
          Closed ({closedTrades.length})
        </button>
      </div>

      {/* Trades Table */}
      <Card>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading trades...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">{tab === 'open' ? 'No open positions' : 'No closed trades'}</p>
            {tab === 'open' && (
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Log a Trade</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full data-table">
              <thead>
                <tr className="bg-[#0a0e1a]">
                  <th>Underlying</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th className="text-right">Premium / Cost</th>
                  <th>Opened</th>
                  <th>Expiry</th>
                  {tab === 'open' && <th className="text-right">DTE</th>}
                  {tab === 'closed' && <th className="text-right">P&L</th>}
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((t: any) => {
                  const today = new Date()
                  const expiry = t.expiry_date ? new Date(t.expiry_date) : null
                  const dte = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                  return (
                    <tr key={t.id}>
                      <td className="font-semibold text-white">{t.underlying}</td>
                      <td><TradeTypeBadge type={t.trade_type} /></td>
                      <td>
                        <div className="text-xs text-gray-400 font-mono">
                          {t.strike_buy
                            ? `${t.strike_sell}/${t.strike_buy}`
                            : `$${t.strike_sell}`}
                          {' · '}
                          {t.contracts}x
                        </div>
                      </td>
                      <td className="text-right font-mono text-sm">
                        <span className={t.trade_type === 'LEAPS' ? 'text-orange-400' : 'text-green-400'}>
                          {t.trade_type === 'LEAPS' ? '–' : '+'}{formatCurrency(t.premium_collected)}
                        </span>
                        {t.trade_type === 'LEAPS' && (
                          <div className="text-xs text-gray-500">cost</div>
                        )}
                      </td>
                      <td className="text-sm text-gray-300">{formatDate(t.open_date)}</td>
                      <td className="text-sm text-gray-300">{formatDate(t.expiry_date)}</td>
                      {tab === 'open' && (
                        <td className="text-right">
                          {dte !== null && (
                            <span className={`text-sm font-mono ${dte <= 3 ? 'text-red-400' : dte <= 7 ? 'text-yellow-400' : 'text-gray-400'}`}>
                              {dte}d
                            </span>
                          )}
                        </td>
                      )}
                      {tab === 'closed' && (
                        <td className={`text-right font-mono text-sm font-semibold ${getPnlColor(t.realized_pnl || 0)}`}>
                          {formatCurrency(t.realized_pnl || 0)}
                        </td>
                      )}
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        <div className="flex gap-1">
                          {t.status === 'open' && (
                            <Button size="sm" variant="success" onClick={() => { setCloseModal(t); setClosePrice('') }}>
                              Close
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteTrade(t.id)}>
                            <X size={12} />
                          </Button>
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

      {/* Add Trade Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Log New Options Trade" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trade Type" required>
              <Select value={form.trade_type} onChange={e => setForm({ ...form, trade_type: e.target.value })}>
                <optgroup label="─ Selling Strategies (Credit)">
                  <option value="CSP">Cash-Secured Put (CSP)</option>
                  <option value="CoveredCall">Covered Call</option>
                  <option value="PutSpread">Put Credit Spread</option>
                  <option value="CallSpread">Call Credit Spread</option>
                </optgroup>
                <optgroup label="─ Buying Strategies (Debit)">
                  <option value="LEAPS">LEAPS Call (Long Call)</option>
                </optgroup>
              </Select>
            </Field>
            <Field label="Underlying" required>
              <Input
                placeholder="e.g. SOXL or SPXW"
                value={form.underlying}
                onChange={e => setForm({ ...form, underlying: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date Opened">
              <Input type="date" value={form.open_date} onChange={e => setForm({ ...form, open_date: e.target.value })} />
            </Field>
            <Field label="Expiry Date" required>
              <Input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label={isSpread ? 'Sell Strike' : isLeaps ? 'Call Strike' : 'Strike'} required>
              <Input type="number" step="0.5" placeholder="e.g. 50" value={form.strike_sell} onChange={e => setForm({ ...form, strike_sell: e.target.value })} />
            </Field>
            {isSpread && (
              <Field label="Buy Strike" required>
                <Input type="number" step="0.5" placeholder="e.g. 45" value={form.strike_buy} onChange={e => setForm({ ...form, strike_buy: e.target.value })} />
              </Field>
            )}
            <Field label="Contracts" required>
              <Input type="number" min="1" value={form.contracts} onChange={e => setForm({ ...form, contracts: e.target.value })} />
            </Field>
          </div>

          <Field
            label={isLeaps ? 'Total Premium Paid ($) — Cost Basis' : 'Total Premium Collected ($)'}
            required
            hint={isLeaps
              ? `Total debit paid. e.g. if you bought at $5.50 × 1 contract = $550`
              : `Total credit received. e.g. if you sold at $1.23 × 1 contract = $123`}
          >
            <Input
              type="number" step="0.01" placeholder={isLeaps ? 'e.g. 550.00' : 'e.g. 123.00'}
              value={form.premium_collected}
              onChange={e => setForm({ ...form, premium_collected: e.target.value })}
            />
          </Field>

          {/* Spread risk/reward summary */}
          {isSpread && form.strike_sell && form.strike_buy && form.premium_collected && (
            <div className="bg-[#1f2937] rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Max Profit</span>
                <span className="text-green-400 font-mono">{formatCurrency(parseFloat(form.premium_collected))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Loss</span>
                <span className="text-red-400 font-mono">
                  {formatCurrency((Math.abs(parseFloat(form.strike_sell) - parseFloat(form.strike_buy)) - parseFloat(form.premium_collected) / (parseInt(form.contracts) * 100)) * parseInt(form.contracts) * 100)}
                </span>
              </div>
            </div>
          )}

          {/* LEAPS info panel */}
          {isLeaps && form.premium_collected && (
            <div className="bg-orange-900/20 border border-orange-500/20 rounded-lg p-3 text-xs space-y-1">
              <p className="text-orange-300 font-medium mb-1">Long Call (LEAPS) — Debit Trade</p>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Loss (cost basis)</span>
                <span className="text-red-400 font-mono">{formatCurrency(parseFloat(form.premium_collected))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Profit</span>
                <span className="text-green-400">Unlimited</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Break-even at expiry</span>
                <span className="text-white font-mono">
                  {form.strike_sell && form.contracts
                    ? `$${(parseFloat(form.strike_sell) + parseFloat(form.premium_collected) / (parseInt(form.contracts) * 100)).toFixed(2)}`
                    : '—'}
                </span>
              </div>
            </div>
          )}

          <Field label="Notes">
            <Input placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={saveTrade}>Save Trade</Button>
          </div>
        </div>
      </Modal>

      {/* Close Trade Modal */}
      <Modal open={!!closeModal} onClose={() => setCloseModal(null)} title="Close Trade" size="sm">
        {closeModal && (() => {
          const isClosingLeaps = closeModal.trade_type === 'LEAPS'
          const cp = parseFloat(closePrice)
          const estPnl = isClosingLeaps
            ? (cp - closeModal.open_price) * closeModal.contracts * closeModal.multiplier
            : (closeModal.open_price - cp) * closeModal.contracts * closeModal.multiplier
          return (
            <div className="space-y-4">
              <div className="bg-[#0a0e1a] rounded-lg p-3 text-sm">
                <p className="font-semibold text-white">{closeModal.symbol}</p>
                {isClosingLeaps ? (
                  <>
                    <p className="text-gray-400 text-xs mt-1">Cost basis: <span className="text-orange-400">{formatCurrency(closeModal.premium_collected)}</span></p>
                    <p className="text-gray-400 text-xs">Bought at: <span className="text-white">${closeModal.open_price}/share</span></p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-400 text-xs mt-1">Premium collected: <span className="text-green-400">{formatCurrency(closeModal.premium_collected)}</span></p>
                    <p className="text-gray-400 text-xs">Sold at: <span className="text-white">${closeModal.open_price}/share</span></p>
                  </>
                )}
              </div>
              <Field label={isClosingLeaps ? 'Sell Price (per share)' : 'Buyback Price (per share)'} required>
                <Input
                  type="number" step="0.01" min="0"
                  placeholder={isClosingLeaps ? 'e.g. 8.50' : 'e.g. 0.10'}
                  value={closePrice}
                  onChange={e => setClosePrice(e.target.value)}
                  autoFocus
                />
              </Field>
              {closePrice && closeModal.open_price && (
                <div className="bg-[#1f2937] rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated P&L</span>
                    <span className={`font-mono font-semibold ${estPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(estPnl)}
                    </span>
                  </div>
                  {isClosingLeaps && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Return on cost</span>
                      <span className={`font-mono ${estPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {closeModal.premium_collected > 0
                          ? `${((estPnl / closeModal.premium_collected) * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setCloseModal(null)}>Cancel</Button>
                <Button className="flex-1" loading={saving} onClick={closeTrade}>Confirm Close</Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
