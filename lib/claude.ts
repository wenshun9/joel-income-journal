import Anthropic from '@anthropic-ai/sdk'
import { MonthlyReport } from '@/types'
import { formatCurrency, formatMonthLabel, formatPct } from '@/lib/utils'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─── YouTube Script Generator ─────────────────────────────────────────────────

export async function generateYouTubeScript(
  report: MonthlyReport,
  userNotes?: string
): Promise<string> {
  const monthLabel = formatMonthLabel(report.month)
  const prevLabel = report.prev_month_combined
    ? `Previous month combined: ${formatCurrency(report.prev_month_combined)}`
    : ''

  const divTable = report.dividend_breakdown
    .map(d => `${d.ticker} | ${d.name || d.ticker} | ${formatCurrency(d.total_net)} | ${d.pct_of_total.toFixed(1)}% | ${d.frequency} | ${d.annualised_yield ? d.annualised_yield.toFixed(1) + '%' : 'N/A'}`)
    .join('\n')

  const spxTable = report.spx_trades
    .map(t => `${t.open_date}–${t.close_date || t.expiry_date} | ${t.symbol} | ${t.trade_type.includes('Call') ? 'Call' : 'Put'} | ${(t.realized_pnl || 0) >= 0 ? 'Win' : 'Loss'} | ${formatCurrency(t.realized_pnl || 0)}`)
    .join('\n')

  const spxWins = report.spx_trades.filter(t => (t.realized_pnl || 0) > 0).length
  const spxTotal = report.spx_trades.length

  const individualHighlights = report.options_trades
    .filter(t => t.trade_type !== 'PutSpread' && t.trade_type !== 'CallSpread')
    .sort((a, b) => Math.abs(b.realized_pnl || 0) - Math.abs(a.realized_pnl || 0))
    .slice(0, 10)
    .map(t => `${t.underlying} ${t.symbol}: ${formatCurrency(t.realized_pnl || 0)}`)
    .join('\n')

  const prompt = `You are writing a YouTube script for Joel Income Journal, a Singapore-based investor documenting his monthly income from dividends and options trading.

MONTH: ${monthLabel}

HEADLINE NUMBERS:
- Dividend Income (Net after 30% WHT): ${formatCurrency(report.dividend_net)}
- Dividend Income (Gross before WHT): ${formatCurrency(report.dividend_gross)}
- Options P&L — Individual: ${formatCurrency(report.options_individual_pnl)}
- Options P&L — SPX Credit Spreads: ${formatCurrency(report.options_spx_pnl)}
- COMBINED TOTAL: ${formatCurrency(report.combined_total)}
${prevLabel}

DIVIDEND BREAKDOWN (Ticker | Name | Net Amount | % of Total | Frequency | Est. Ann. Yield):
${divTable}

INDIVIDUAL OPTIONS HIGHLIGHTS:
${individualHighlights}

SPX CREDIT SPREADS (Date | Spread | Type | Result | P&L):
${spxTable}
SPX Win Rate: ${spxWins}/${spxTotal} (${spxTotal > 0 ? ((spxWins / spxTotal) * 100).toFixed(0) : 0}%)

${userNotes ? `ADDITIONAL NOTES FROM JOEL:\n${userNotes}` : ''}

Write a complete YouTube script following this EXACT structure:

1. OPENING HOOK (~3-4 sentences, engaging, references the month's key achievement)
2. DISCLAIMER (Singapore-based investor, 30% WHT, not financial advice, portfolio snapshot date)
3. MARCH ${monthLabel.split(' ')[1]} — THE HEADLINE NUMBERS (present the 4 key figures clearly)
4. SECTION 1 — DIVIDEND INCOME
   - Reference the annualised yield column and why it matters
   - Present the full dividend table (all tickers)
   - Commentary on 4-5 notable positions (highest yielders, conservative anchors, interesting stories)
   - The big picture on yield (pattern: high yield = high risk/NAV erosion)
5. SECTION 2 — OPTIONS TRADING
   - Individual options total P&L
   - SPX credit spreads total P&L
   - Walk through 3-4 most notable individual trades (wins and losses)
   - SPX credit spreads: present the full table, explain what a credit spread is, discuss the one losing trade and what was learned
   - Honest disclaimer on results
6. SECTION 3 — PUTTING IT ALL TOGETHER (combined summary table)
7. PERSONAL REFLECTION (~2-3 paragraphs, authentic, references Joel's life as a Singapore civil servant, family, building passive income journey — NOT about quitting work but about building choices)
8. CLOSING + CALL TO ACTION (question for comments, like/subscribe, Snowball portfolio link mention, previous video links)

TONE: Authentic, educational, honest about risks, never hype. Joel is a regular person building this carefully, month by month. He's transparent about losses. He speaks to viewers who are building similar journeys.

Return ONLY the script text, formatted with clear section headers. Do not add any preamble or explanation.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  })

  return (message.content[0] as { type: string; text: string }).text
}

// ─── Substack Post Generator ──────────────────────────────────────────────────

export async function generateSubstackPost(
  report: MonthlyReport,
  youtubeScript?: string
): Promise<string> {
  const monthLabel = formatMonthLabel(report.month)

  const prompt = `You are writing a Substack article for Joel Income Journal.

${youtubeScript
    ? `Here is the YouTube script for this month. Reformat it as a written Substack article — same content, but as flowing prose with markdown formatting instead of a video script.\n\nYOUTUBE SCRIPT:\n${youtubeScript}`
    : `Write a Substack article for the ${monthLabel} income report with these numbers:
- Combined total: ${formatCurrency(report.combined_total)}
- Dividend net: ${formatCurrency(report.dividend_net)}
- Options P&L: ${formatCurrency(report.options_total_pnl)}`
  }

SUBSTACK FORMAT:
- Use markdown headers (## for sections)
- Include the dividend and options tables in markdown table format
- Written in first person, conversational but informative
- Add a brief intro and summary paragraph
- End with a question to readers for comments
- Include a disclaimer section

Return ONLY the Substack post in markdown format.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 5000,
    messages: [{ role: 'user', content: prompt }],
  })

  return (message.content[0] as { type: string; text: string }).text
}
