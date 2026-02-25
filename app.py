#!/usr/bin/env python3
"""
SDM Industry Search Engine
───────────────────────────
Unified Flask application with three intelligence sectors:
  1. Legal & Litigation Intelligence
  2. Digital Asset Treasury & Finance
  3. Event Intelligence

Usage:
    python3 app.py [port]          # default port 5055

External APIs used:
  - CourtListener (https://www.courtlistener.com/api/)
      Free, no key required. Searches federal court opinions and dockets
      for litigation cases. Used by the Legal & Litigation sector.

  - SEC EDGAR EFTS (https://efts.sec.gov/)
      Free, no key required. Full-text search of SEC filings and
      enforcement actions. Used by the Legal & Litigation sector.

  - CanLII (https://api.canlii.org/)
      Free API key required (optional). Searches Canadian case law.
      Used by the Legal & Litigation sector. Key set via CANLII_API_KEY env var.

  - Bitcoin Treasuries (https://playground.bitcointreasuries.net/api/)
      Free, no key required. Returns list of public companies holding
      Bitcoin on their balance sheet. Used by the Treasury & Finance sector.

  - Apollo.io (https://api.apollo.io/api/v1/)
      Paid API, key required. Looks up professional contact information
      (name, title, email, phone, LinkedIn) for people at companies.
      Used by Treasury & Finance sector (find CFOs/Treasurers) and
      Event Intelligence sector (enrich attendee data). Key set via
      APOLLO_API_KEY env var.

  - Luma (https://api.lu.ma/)
      Public API, no key required. Fetches event details and publicly
      visible guest lists from Luma event pages. Falls back to HTML
      scraping if API doesn't return data. Used by the Event Intelligence sector.

Environment variables (all loaded from .env file):
  - APOLLO_API_KEY  — Apollo.io API key (required for contact lookups)
  - CANLII_API_KEY  — CanLII API key (optional, for Canadian case law)
  - PORT            — Server port (default 5055, set automatically by Render)
  - RENDER          — Set to "true" on Render.com to skip auto-install
"""

import os
import subprocess
import sys
import threading

# ── Auto-install dependencies (local dev only; skipped on Render) ────────
if os.environ.get("RENDER") is None:
    _REQUIRED = [
        "flask", "requests", "beautifulsoup4", "openpyxl",
        "python-dotenv", "requests-html",
    ]
    for pkg in _REQUIRED:
        _import = pkg.replace("beautifulsoup4", "bs4").replace("python-dotenv", "dotenv").replace("requests-html", "requests_html")
        try:
            __import__(_import)
        except ImportError:
            print(f"Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "-q", "install", pkg])

from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template

load_dotenv()

# ── Flask app ────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# ── Register blueprints ─────────────────────────────────────────────────
from routes.legal import legal_bp
from routes.treasury import treasury_bp
from routes.events import events_bp

app.register_blueprint(legal_bp)
app.register_blueprint(treasury_bp)
app.register_blueprint(events_bp)


# ── Home ─────────────────────────────────────────────────────────────────

@app.route("/")
def home():
    return render_template("home.html", active="")


# ── Health check (for Render) ───────────────────────────────────────────

@app.route("/health")
def health_check():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ── Legacy route redirects ──────────────────────────────────────────────

@app.route("/apollo")
def apollo_redirect():
    return redirect("/treasury")


# ── Cache warming ───────────────────────────────────────────────────────

# Pre-fetch Bitcoin Treasuries data in a background thread on startup
# so the Treasury page loads instantly on first visit.
def _warm_cache():
    try:
        from services.bitcoin_treasuries import fetch_bt_companies
        fetch_bt_companies()
    except Exception:
        pass

threading.Thread(target=_warm_cache, daemon=True).start()


# ── Main ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from services.apollo import check_api_key

    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 5055))
    print(f"\n  SDM Industry Search Engine")
    print(f"  http://localhost:{port}")
    print(f"  ─────────────────────────")
    print(f"  Sectors:")
    print(f"    /legal     — Legal & Litigation Intelligence")
    print(f"    /treasury  — Digital Asset Treasury & Finance")
    print(f"    /events    — Event Intelligence")
    ok, msg = check_api_key()
    if not ok:
        print(f"\n  Note: Apollo API key not configured.")
        print(f"  Legal + Treasury list work without it; contact lookup needs .env setup.")
    print()
    app.run(host="0.0.0.0", port=port, debug=False)
