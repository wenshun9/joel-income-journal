# Joel Income Journal

Your personal investment income dashboard — dividends, options, and monthly report + script generator.

## Setup (One Time)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version). Click Install, follow prompts.

### Step 2 — Set up Supabase (Free)
1. Go to https://supabase.com → Sign Up (free)
2. Click **New Project** → give it a name → set a database password → Create
3. Once created, go to **SQL Editor** → **New Query**
4. Copy everything from `supabase/schema.sql` in this folder and paste it → **Run**
5. Go to **Project Settings → API**
6. Copy your **Project URL** and **anon public key** — you'll need these next

### Step 3 — Configure the App
1. In this folder, find `.env.local.example`
2. Duplicate it and rename the copy to `.env.local`
3. Open `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL from Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key from Supabase
   - `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
   - `NEXT_PUBLIC_APP_URL` = `http://localhost:3000` (for local) or your Vercel URL once deployed

### Step 4 — Run Locally
Open Terminal, navigate to this folder, and run:
```bash
npm install
npm run dev
```
Open http://localhost:3000 in your browser.

---

## Deploy to Vercel (Access from Any Device)

1. Create a free account at https://vercel.com
2. Install Vercel CLI: `npm install -g vercel`
3. In this folder, run: `vercel`
4. Follow the prompts — it deploys automatically
5. Go to your Vercel dashboard → your project → **Settings → Environment Variables**
6. Add all 4 variables from your `.env.local`
7. Redeploy: `vercel --prod`
8. Your app is now live at `https://your-project.vercel.app` — accessible from phone and laptop

---

## Monthly Workflow

1. **Upload** → Go to Upload page
   - Export IBKR Activity Statement (CSV) for the month → Upload
   - Export Snowball Holdings (CSV) → Upload
2. **Review** → Check Holdings, Dividends, Options tabs
3. **Report** → Go to Report page to see the full monthly breakdown
4. **Script** → Go to Script page → Click Generate → Edit if needed → Download

---

## Features

| Page | What it does |
|------|-------------|
| Dashboard | Monthly income at a glance, upcoming dividends, open options |
| Holdings | All positions with live prices (Yahoo Finance), unrealized P&L |
| Dividends | Monthly breakdown by ticker, annualised yield, all individual payments |
| Options | Track open/closed CSP, covered calls, SPX credit spreads |
| Report | Full monthly income report (mirrors your YouTube format) |
| Script | AI generates your YouTube script + Substack post from the data |
| Upload | IBKR statement + Snowball CSV uploads |

## Notes
- All prices are USD
- 30% withholding tax is automatically deducted from all dividend income
- Live prices refresh every 5 minutes via Yahoo Finance
- Options can be entered manually or auto-imported from the IBKR statement
- Scripts are generated using Claude (Anthropic API) and can be edited in-app
