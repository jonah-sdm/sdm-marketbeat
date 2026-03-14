#!/usr/bin/env python3
"""
Scrape daily ETF flow data from farside.co.uk and write etf-data.json.
Runs as a GitHub Action (ubuntu-latest) nightly after US market close.

Note: farside.co.uk blocks some residential/VPN IPs. GitHub Actions runner
IPs are distinct cloud IPs and typically pass through.
"""

import json
import re
import sys
import time
from datetime import date, datetime, timezone

import requests
from bs4 import BeautifulSoup

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
})

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
    t = text.strip().replace(",", "").replace("\u2013", "").replace("\xa0", "")
    if not t or t in ("-", "—", "n/a", "N/A", "*", ""):
        return None
    neg = t.startswith("(") and t.endswith(")")
    try:
        return -float(t.strip("()")) if neg else float(t.strip("()"))
    except ValueError:
        return None


def extract_ticker(name: str, ticker_map: dict):
    upper = name.upper()
    m = re.search(r"\(([A-Z]{2,6})\)", upper)
    if m and m.group(1) in ticker_map:
        return ticker_map[m.group(1)]
    for key, val in ticker_map.items():
        if re.search(rf"\b{re.escape(key)}\b", upper):
            return val
    return None


def scrape_farside(url: str, ticker_map: dict) -> dict:
    # Warm session with homepage visit (sets cookies, proves we're a browser)
    try:
        SESSION.get("https://farside.co.uk/", timeout=12)
        time.sleep(1.5)
    except Exception:
        pass

    resp = SESSION.get(url, timeout=30, headers={"Referer": "https://farside.co.uk/"})
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        print(f"  WARNING: no <table> found (HTML len={len(resp.text)})", file=sys.stderr)
        # Dump first 500 chars for debugging
        print(f"  HTML start: {resp.text[:500]}", file=sys.stderr)
        return {}

    # Use the table with the most rows (the data table)
    table = max(tables, key=lambda t: len(t.find_all("tr")))
    rows = table.find_all("tr")
    print(f"  Table rows: {len(rows)}")
    if len(rows) < 3:
        return {}

    header_cells = rows[0].find_all(["th", "td"])
    n_cols = len(header_cells)
    total_col = next(
        (i for i, c in enumerate(header_cells) if c.get_text(strip=True).lower() == "total"),
        None,
    )
    last_data_col = (total_col - 1) if total_col else (n_cols - 2)

    # Scan right-to-left for last column with real values
    for col_idx in range(last_data_col, 0, -1):
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if col_idx < len(cells) and parse_value(cells[col_idx].get_text()) is not None:
                last_data_col = col_idx
                break
        else:
            continue
        break

    date_label = header_cells[last_data_col].get_text(strip=True) if last_data_col < n_cols else "?"
    print(f"  Data column: {last_data_col} → '{date_label}'")

    result = {}
    for row in rows[1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        fund_name = cells[0].get_text(strip=True)
        if not fund_name or fund_name.lower() in ("fund", "total", ""):
            continue
        ticker = extract_ticker(fund_name, ticker_map)
        if not ticker:
            continue
        val = parse_value(cells[last_data_col].get_text()) if last_data_col < len(cells) else None
        result[ticker] = val

    return result


def main():
    today = date.today().isoformat()
    now_utc = datetime.now(timezone.utc).isoformat()
    print(f"Scraping ETF flows for {today} …\n")

    output = {"date": today, "btc": {}, "eth": {}, "sol": {}, "scraped_at": now_utc}

    print("→ farside.co.uk/bitcoin-etf/")
    try:
        btc = scrape_farside("https://farside.co.uk/bitcoin-etf/", BTC_TICKER_MAP)
        output["btc"] = btc
        print(f"  BTC ({len(btc)} tickers): {dict(list(btc.items())[:4])} …")
    except Exception as e:
        print(f"  ERROR (BTC): {e}", file=sys.stderr)

    print("\n→ farside.co.uk/ethereum-etf/")
    try:
        eth = scrape_farside("https://farside.co.uk/ethereum-etf/", ETH_TICKER_MAP)
        output["eth"] = eth
        print(f"  ETH ({len(eth)} tickers): {eth}")
    except Exception as e:
        print(f"  ERROR (ETH): {e}", file=sys.stderr)

    with open("etf-data.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nWrote etf-data.json")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
