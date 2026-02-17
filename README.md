# SDM Industry Search Engine

A unified Flask web application with three intelligence sectors for sales development and market research in the cryptocurrency and digital asset space.

## Sectors

### 1. Legal & Litigation Intelligence (`/legal`)
Search federal court records, SEC filings, and case law databases for cryptocurrency litigation and bankruptcy cases.

- **CourtListener API** — Search opinions and dockets (free, no key)
- **SEC EDGAR API** — Full-text search of SEC filings (free, no key)
- **CanLII** — Canadian case law (optional API key)
- **Manual search URLs** — DOJ, FTC, Justia, Google Scholar, PACER, Stretto
- Extracts plaintiff names, creditor names, case details
- Export results to Excel or JSON

### 2. Digital Asset Treasury & Finance (`/treasury`)
Browse public companies with verified Bitcoin treasury holdings and find finance decision-makers.

- **Bitcoin Treasuries API** — Company list with BTC holdings (free, cached 24h)
- **Apollo.io API** — Contact enrichment for CFOs, Treasurers, Finance Directors
- Searchable dropdown with filter/sort
- Top 100 holdings browsable view
- Export contacts + holdings to Excel

### 3. Event Intelligence (`/events`)
Extract attendee information from Luma event pages and enrich with professional contact data.

- **Luma event scraping** — Extracts event details + publicly visible attendees
- **Apollo.io enrichment** — Adds professional contact data (email, phone, LinkedIn)
- Attendee cards with contact details
- Export event data + enriched contacts to Excel

## Quick Start

```bash
# 1. Install dependencies
pip3 install -r requirements.txt

# 2. Configure API keys
cp .env.example .env
# Edit .env and add your Apollo.io API key

# 3. Run the application
python3 app.py
```

Open http://localhost:5055 in your browser.

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APOLLO_API_KEY` | For contact lookup | Apollo.io API key for people search |
| `CANLII_API_KEY` | Optional | CanLII API key for Canadian case law |

### API Keys

- **Apollo.io**: Get a key at https://app.apollo.io/#/settings/integrations/api_keys
  - Free tier works (with some data redacted)
  - Required for: Treasury contacts, Event attendee enrichment
- **CourtListener**: No key needed (free public API)
- **SEC EDGAR**: No key needed (free public API)
- **Bitcoin Treasuries**: No key needed (free public API)

## File Structure

```
.
├── app.py                  # Main Flask application
├── legal_case_search.py    # Legal search backend (CourtListener, SEC, CanLII)
├── json_to_excel.py        # Rich Excel export for legal results
├── templates/
│   ├── base.html           # Base template (nav, shared layout)
│   ├── home.html           # Homepage with 3 sector cards
│   ├── legal.html          # Legal & Litigation search
│   ├── treasury.html       # Treasury & Finance sector
│   └── events.html         # Event Intelligence sector
├── static/
│   └── css/
│       └── style.css       # Shared CSS styles
├── .env                    # API keys (not committed)
├── .env.example            # Template for .env
├── requirements.txt        # Python dependencies
└── README.md               # This file
```

## Features

- **Pagination** — All result lists paginated (default 10, options: 10/25/50)
- **Caching** — Bitcoin Treasuries data cached for 24 hours; legal results cached 1 hour
- **Responsive design** — Works on desktop and mobile
- **Breadcrumb navigation** — Home > Sector > Results
- **Excel export** — All sectors support Excel download with formatted spreadsheets
- **Error handling** — User-friendly error messages with retry options
- **Loading states** — Skeleton loading animations while data fetches
- **Searchable dropdown** — Treasury sector uses filtered search, not slow-loading table

## API Rate Limits

- **Apollo.io**: ~100 requests/hour on free tier. The app uses `time.sleep()` between requests
- **CourtListener**: Generous rate limits, but the app uses retry logic with backoff
- **Bitcoin Treasuries**: No documented limits; cached to reduce calls

## Port

Default port is `5055`. Override with:

```bash
python3 app.py 8080
```
