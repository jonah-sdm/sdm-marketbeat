"""
Bitcoin Treasuries API helpers
──────────────────────────────
Fetches and caches the list of public companies holding Bitcoin
from the Bitcoin Treasuries public API. No API key required.
"""

import os
import time

import requests as http_requests
from dotenv import load_dotenv

load_dotenv()

BT_API = os.getenv("BT_API_BASE", "https://playground.bitcointreasuries.net/api")
_bt_cache = {"companies": None, "btc_price": None, "ts": 0}
BT_CACHE_TTL = int(os.getenv("BT_CACHE_TTL", "86400"))  # 24 hours


# Make a GET request to the Bitcoin Treasuries API with retry logic
def _bt_get(path, retries=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SDM-Search/1.0",
        "Accept": "application/json",
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = http_requests.get(f"{BT_API}/{path}", headers=headers, timeout=15)
            try:
                data = r.json()
                if data:
                    return data, None
            except ValueError:
                pass
            if r.status_code >= 400 and attempt < retries:
                time.sleep(1)
                continue
            if r.status_code >= 400:
                return None, f"HTTP {r.status_code}"
            return r.json(), None
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(1)
    return None, str(last_err)


# Fetch all companies with Bitcoin treasury holdings from the Bitcoin Treasuries API.
# Results are cached in memory for BT_CACHE_TTL seconds (default 24h) to avoid repeat calls.
def fetch_bt_companies():
    now = time.time()
    if _bt_cache["companies"] and (now - _bt_cache["ts"]) < BT_CACHE_TTL:
        return _bt_cache["companies"], _bt_cache["btc_price"], None

    data, err = _bt_get("companies")
    if err:
        return None, None, f"Bitcoin Treasuries API error: {err}"

    btc_price = None
    price_data, _ = _bt_get("market/btc-price")
    if price_data:
        btc_price = price_data.get("price")

    _bt_cache["companies"] = data
    _bt_cache["btc_price"] = btc_price
    _bt_cache["ts"] = now
    return data, btc_price, None


# Transform raw Bitcoin Treasuries API data into clean display objects.
# Filters out companies with zero holdings, calculates USD values, and adds rank.
def format_btc_holdings(companies, btc_price):
    result = []
    for co in companies:
        btc = 0
        try:
            btc = int(co.get("btcHoldings", 0) or 0)
        except (ValueError, TypeError):
            try:
                btc = int(float(co.get("btcHoldings", 0) or 0))
            except (ValueError, TypeError):
                pass
        if btc <= 0:
            continue
        usd_val = btc * btc_price if btc_price else None
        mcap = None
        try:
            mcap = float(co.get("marketCap", 0) or 0)
        except (ValueError, TypeError):
            pass
        result.append({
            "name": co.get("name", ""),
            "symbol": co.get("symbol", ""),
            "country": co.get("country", ""),
            "btc_holdings": btc,
            "usd_value": usd_val,
            "market_cap": mcap,
            "stock_price": co.get("stockPrice"),
            "mnav": co.get("mNav"),
            "btc_yield": co.get("btcYield"),
            "avg_cost_basis": co.get("avgCostBasis"),
            "last_updated": co.get("lastUpdated", ""),
        })
    result.sort(key=lambda x: x["btc_holdings"], reverse=True)
    for i, co in enumerate(result):
        co["rank"] = i + 1
    return result
