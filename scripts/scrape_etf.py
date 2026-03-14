#!/usr/bin/env python3
"""
Scrape daily ETF flow data from farside.co.uk and write etf-data.json.
Runs as a GitHub Action nightly after US market close.
"""

import json
import re
import sys
from datetime import date, datetime, timedelta

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
}

# Map farside fund-name keywords → our app tickers
BTC_TICKER_MAP = {
    "IBIT": "IBIT", "FBTC": "FBTC", "BITB": "BITB", "ARKB": "ARKB",
    "BTCO": "BTCO", "EZBC": "EZBC", "BRRR": "BRRR", "HODL": "HODL",
    "BTCW": "BTCW", "GBTC": "GBTC", "XBTF": "BTC",  "BTC":  "BTC",
}
ETH_TICKER_MAP = {
    "ETHA": "ETHA", "FETH": "FETH", "ETHW": "ETHW", "CETH": "CETH",
    "ETHV": "ETHV", "QETH": "QETH", "EZET": "EZET", "ETHE": "ETHE",
    "ETH":  "ETH",
}


def parse_value(text: str):
    """Return float or None for a cell value."""
    t = text.strip().replace(",", "").replace("\u2013", "").replace("-", "")
    if not t or t in ("-", "—", "n/a", "N/A"):
        return None
    # Handle parenthetical negatives like (25.4)
    neg = text.strip().startswith("(")
    try:
        v = float(t.strip("()"))
        return -v if neg else v
    except ValueError:
        return None


def extract_ticker_from_name(name: str, ticker_map: dict):
    """Try to find a known ticker inside a fund name string."""
    upper = name.upper()
    # Check parenthetical ticker first: "iShares (IBIT)"
    m = re.search(r"\(([A-Z]{2,6})\)", upper)
    if m and m.group(1) in ticker_map:
        return ticker_map[m.group(1)]
    # Check if any known ticker appears as a word in the name
    for key, val in ticker_map.items():
        if re.search(rf"\b{re.escape(key)}\b", upper):
            return val
    return None


def scrape_farside(url: str, ticker_map: dict) -> dict:
    """Return {ticker: float_or_None} for the most recent trading day."""
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        print(f"  WARNING: no table found at {url}", file=sys.stderr)
        return {}

    rows = table.find_all("tr")
    if len(rows) < 2:
        return {}

    # --- find the last populated date column ---
    header_row = rows[0]
    header_cells = header_row.find_all(["th", "td"])
    n_cols = len(header_cells)

    # "Total" is usually the last column — exclude it
    total_col = None
    for i, cell in enumerate(header_cells):
        if cell.get_text(strip=True).lower() == "total":
            total_col = i
            break

    # Walk data rows to find the rightmost column that has any non-empty value
    # (some dates may have no data yet if it's early in the trading day)
    last_data_col = (total_col - 1) if total_col else (n_cols - 2)

    # Scan right-to-left from last_data_col to find a column with real values
    for col_idx in range(last_data_col, 0, -1):
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if col_idx >= len(cells):
                continue
            v = parse_value(cells[col_idx].get_text())
            if v is not None:
                last_data_col = col_idx
                break
        else:
            continue
        break

    # Extract the date label for that column
    date_label = ""
    if last_data_col < len(header_cells):
        date_label = header_cells[last_data_col].get_text(strip=True)

    print(f"  Most recent column index {last_data_col} → '{date_label}'")

    # --- parse fund rows ---
    result = {}
    for row in rows[1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        fund_name = cells[0].get_text(strip=True)
        if not fund_name or fund_name.lower() in ("fund", "total", ""):
            continue
        ticker = extract_ticker_from_name(fund_name, ticker_map)
        if not ticker:
            continue
        if last_data_col < len(cells):
            val = parse_value(cells[last_data_col].get_text())
            result[ticker] = val
        else:
            result[ticker] = None

    return result


def main():
    today = date.today().isoformat()
    print(f"Scraping ETF flows for {today} …")

    output = {"date": today, "btc": {}, "eth": {}, "sol": {}, "scraped_at": datetime.utcnow().isoformat() + "Z"}

    print("  → farside.co.uk/bitcoin-etf/")
    try:
        btc = scrape_farside("https://farside.co.uk/bitcoin-etf/", BTC_TICKER_MAP)
        output["btc"] = {k: v for k, v in btc.items()}
        print(f"     Got {len(btc)} BTC tickers: {btc}")
    except Exception as e:
        print(f"  ERROR (BTC): {e}", file=sys.stderr)

    print("  → farside.co.uk/ethereum-etf/")
    try:
        eth = scrape_farside("https://farside.co.uk/ethereum-etf/", ETH_TICKER_MAP)
        output["eth"] = {k: v for k, v in eth.items()}
        print(f"     Got {len(eth)} ETH tickers: {eth}")
    except Exception as e:
        print(f"  ERROR (ETH): {e}", file=sys.stderr)

    out_path = "etf-data.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
