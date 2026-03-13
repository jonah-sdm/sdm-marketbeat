# SDM MarketBeat — Setup & API Checklist

This document is the single source of truth for API keys, where they live,
what breaks without them, and the daily publishing workflow.

---

## Products in this repo

| Product | Stack | Runs at | Deployed on |
|---|---|---|---|
| **MarketBeat** — daily crypto brief | React + Vite | `/` (root) | Vercel |
| **Industry Search Engine** — sales intel | Python + Flask | `python3 app.py` (port 5055) | Render.com |

---

## API Keys

### Required to configure

| Key | Used by | Where to get it | Fallback if missing |
|---|---|---|---|
| `VITE_ANTHROPIC_API_KEY` | MarketBeat — AI analyst brief | [console.anthropic.com](https://console.anthropic.com/) | Static fallback text shown |
| `APOLLO_API_KEY` | Industry Search Engine — contact lookup in Treasury + Events | [apollo.io → Settings → API](https://app.apollo.io/#/settings/integrations/api_keys) | Search Engine loads; contact enrichment disabled |

### Optional

| Key | Used by | Where to get it | Fallback if missing |
|---|---|---|---|
| `CANLII_API_KEY` | Industry Search Engine — Canadian case law | [developer.canlii.org](https://developer.canlii.org/) | CanLII tab hidden; US sources still work |

### No key needed (free public APIs)

| Service | Used by | What it provides |
|---|---|---|
| CoinGecko `/simple/price` + `/global` | MarketBeat | BTC/ETH price, 24h change, dominance, total market cap |
| Coinglass `/public/v2/funding` | MarketBeat | Perpetual funding rates, CME basis, open interest |
| Polymarket Gamma API | MarketBeat | ETF approval probabilities (SOL, XRP, multi-coin) |
| allorigins.win → CoinDesk RSS | MarketBeat | Top 6 news headlines |
| CourtListener API | Industry Search Engine | Federal court opinions + dockets |
| SEC EDGAR EFTS | Industry Search Engine | SEC filings + enforcement actions |
| Bitcoin Treasuries API | Industry Search Engine | Public companies holding BTC |
| Luma public API / scrape | Industry Search Engine | Event attendee lists |

### Manual data (no API exists)

| Data | Source | How to enter | Frequency |
|---|---|---|---|
| ETF daily flows (BTC/ETH/SOL) | [@FarsideUK on X](https://x.com/FarsideUK) — posted nightly ET | Click "Enter flows" in Section 03 | Daily, after ~9 PM ET |
| Economic calendar | Hardcoded `ECON` array in `src/App.jsx:14–23` | Edit the file directly | Quarterly (or when events change) |

---

## Where keys are stored

### Local development (`.env`)

Copy `.env.example` → `.env` in the repo root. This file is git-ignored.

```
# .env
VITE_ANTHROPIC_API_KEY=sk-ant-...     ← MarketBeat
APOLLO_API_KEY=...                     ← Industry Search Engine
CANLII_API_KEY=...                     ← optional
```

### Vercel (MarketBeat production)

Dashboard → Project `sdm-marketbeat` → **Settings → Environment Variables**

| Variable | Environment |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Production, Preview, Development |

> Note: Vite bakes `VITE_*` variables into the client bundle at build time.
> Rotating the key requires a redeploy. Before public launch, move the
> Anthropic call to a serverless function (`api/brief.js`) so the key is
> never exposed in the browser bundle.

### Render.com (Industry Search Engine production)

Dashboard → Service `sdm-search-engine` → **Environment**

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | your key |
| `PYTHON_VERSION` | 3.11.6 |
| `RENDER` | true |

---

## Daily publishing workflow (MarketBeat)

Each morning, follow these steps to produce and publish the daily report.

```
[ ] 1. Open the live Vercel URL — data reloads automatically on page open
        - BTC/ETH prices, dominance, market cap  ← CoinGecko (auto)
        - Funding rates, CME basis, OI            ← Coinglass (auto)
        - Polymarket ETF odds                     ← Polymarket (auto)
        - Top news headlines                      ← CoinDesk RSS (auto)
        - AI analyst brief                        ← Claude / Anthropic (auto)

[ ] 2. Enter ETF flows (Section 03)
        - Go to @FarsideUK on X — flows are posted nightly (~9 PM ET)
        - Click "Enter flows" button
        - Type each issuer's value in US$M (negative = outflow, blank = skip)
        - Click "Lock flows" when done

[ ] 3. Export HTML
        - Click "Export HTML ↓" in the top-right
        - File downloads as: sdm-marketbeat-YYYY-MM-DD.html
        - This is a self-contained file — Google Fonts is the only external dep

[ ] 4. Publish to Webflow blog
        - Option A — Embed iframe: host the HTML file on Vercel Static / S3 / CDN,
          embed on the blog post page with <iframe src="..."> at full width
        - Option B — Embed block: open the HTML file, copy everything inside
          <body>…</body>, paste into a Webflow HTML embed element on the post page
        - Option C — Upload to Webflow CMS: use Webflow's "Custom Code" field
          on the blog post collection item, paste the body HTML there
```

---

## Local dev commands

```bash
# MarketBeat (React/Vite)
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run preview      # preview the production build

# Industry Search Engine (Flask)
python3 app.py       # http://localhost:5055
python3 app.py 8080  # custom port
```

---

## Rate limits & known issues

| Service | Limit | Notes |
|---|---|---|
| CoinGecko (free tier) | ~30 req/min | Shared IP rate limit; may throttle on busy deploys |
| Coinglass (free) | Undocumented | CME basis + OI fall back to mock values if blocked |
| Apollo.io (free tier) | ~100 req/hr | App adds `time.sleep()` between requests |
| CourtListener | Generous; retry logic built in | — |
| Anthropic (Claude API) | Pay-per-token | Runs once per page load; ~1,000 tokens per request |
| allorigins.win (CORS proxy) | Public, shared | If down, CoinDesk RSS falls back to mock headlines |

---

## Security notes

1. **VITE_ANTHROPIC_API_KEY is client-side.** Anyone with the Vercel URL can
   extract the key from the bundle. Fine for internal use. Before public launch
   at `marketbeat.sdm.co`, move to a Vercel serverless function (`api/brief.js`).

2. **APOLLO_API_KEY is server-side only.** It lives in Render env vars and is
   never exposed to the browser.

3. **`.env` is git-ignored.** Never commit real keys. Use `.env.example` as
   the template.
