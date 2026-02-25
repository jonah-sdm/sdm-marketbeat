"""
Digital Asset Treasury & Finance routes
─────────────────────────────────────────
Blueprint handling all /treasury/* endpoints:
  /treasury/              — main page
  /treasury/api/bt-companies — BT company list
  /treasury/api/people    — Apollo contact lookup
  /treasury/api/download/* — JSON and Excel exports
"""

import json
import os
import re
import tempfile

from flask import Blueprint, request, render_template, send_file, jsonify

from services.apollo import (
    check_api_key, find_people_at_companies, TREASURY_TITLES, TITLE_SETS,
)
from services.bitcoin_treasuries import fetch_bt_companies, format_btc_holdings
from services.excel import create_xlsx_from_data

treasury_bp = Blueprint("treasury", __name__, url_prefix="/treasury")


@treasury_bp.route("/")
def treasury_index():
    ok, msg = check_api_key()
    return render_template("treasury.html", active="treasury", api_ok=ok, api_msg=msg)


@treasury_bp.route("/api/bt-companies")
def bt_companies_api():
    companies, btc_price, err = fetch_bt_companies()
    if err:
        return jsonify({"error": err}), 400
    formatted = format_btc_holdings(companies, btc_price)
    return jsonify({"companies": formatted, "btc_price": btc_price, "total": len(formatted)})


@treasury_bp.route("/api/people")
def treasury_people():
    try:
        ok, msg = check_api_key()
        print(f"[Treasury] /api/people called — API key present: {ok}")
        if not ok:
            return jsonify({"error": msg}), 400
        company = request.args.get("company", "").strip()
        domain = request.args.get("domain", "").strip()
        role = request.args.get("role", "all")
        print(f"[Treasury] Looking up: company={company}, domain={domain}, role={role}")
        if not company:
            return jsonify({"error": "Company name required"}), 400
        titles = TITLE_SETS.get(role, TREASURY_TITLES)
        people = find_people_at_companies(
            [{"name": company, "domain": domain}],
            titles,
            max_companies=1,
        )
        print(f"[Treasury] Found {len(people)} contacts for {company}")
        return jsonify({"people": people, "company": company, "titles_searched": len(titles)})
    except Exception as e:
        print(f"[Treasury] ERROR in /api/people: {e}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@treasury_bp.route("/api/download/json")
def treasury_download_json():
    ok, msg = check_api_key()
    if not ok:
        return msg, 400
    company = request.args.get("company", "").strip()
    domain = request.args.get("domain", "").strip()
    symbol = request.args.get("symbol", "").strip()
    role = request.args.get("role", "all")
    if not company:
        return "Company name required", 400
    titles = TITLE_SETS.get(role, TREASURY_TITLES)
    people = find_people_at_companies([{"name": company, "domain": domain}], titles, max_companies=1)

    holdings = None
    bt_cos, btc_price, _ = fetch_bt_companies()
    if bt_cos:
        formatted = format_btc_holdings(bt_cos, btc_price)
        for co in formatted:
            if co["symbol"] == symbol or co["name"].lower() == company.lower():
                holdings = co
                break

    output = {
        "company": company, "symbol": symbol, "role_filter": role,
        "btc_price": btc_price, "holdings": holdings,
        "contacts": people, "total_contacts": len(people),
    }
    safe = re.sub(r'[^\w\-]', '_', company)
    path = os.path.join(tempfile.gettempdir(), f"treasury_{safe}.json")
    with open(path, "w") as f:
        json.dump(output, f, indent=2)
    return send_file(path, as_attachment=True, download_name=f"treasury_{safe}.json",
                     mimetype="application/json")


@treasury_bp.route("/api/download/xlsx")
def treasury_download_xlsx():
    ok, msg = check_api_key()
    if not ok:
        return msg, 400
    company = request.args.get("company", "").strip()
    domain = request.args.get("domain", "").strip()
    symbol = request.args.get("symbol", "").strip()
    role = request.args.get("role", "all")
    if not company:
        return "Company name required", 400

    titles = TITLE_SETS.get(role, TREASURY_TITLES)
    people = find_people_at_companies([{"name": company, "domain": domain}], titles, max_companies=1)

    holdings = {}
    bt_cos, btc_price, _ = fetch_bt_companies()
    if bt_cos:
        formatted = format_btc_holdings(bt_cos, btc_price)
        for co in formatted:
            if co["symbol"] == symbol or co["name"].lower() == company.lower():
                holdings = co
                break

    rows = []
    for p in people:
        rows.append([
            p.get("name", ""),
            p.get("title", ""),
            p.get("company", ""),
            p.get("email", ""),
            p.get("phone", ""),
            p.get("linkedin_url", ""),
            f"{p.get('city', '')}, {p.get('state', '')}".strip(", "),
            p.get("country", ""),
            p.get("company_industry", ""),
            holdings.get("btc_holdings", ""),
            holdings.get("usd_value", ""),
            holdings.get("market_cap", ""),
            holdings.get("symbol", symbol),
        ])

    sheets = [{
        "title": f"Treasury Contacts - {company}"[:31],
        "headers": ["Name", "Title", "Company", "Email", "Phone", "LinkedIn",
                     "Location", "Country", "Industry",
                     "BTC Holdings", "USD Value", "Market Cap", "Ticker"],
        "rows": rows,
    }]

    safe = re.sub(r'[^\w\-]', '_', company)
    path = create_xlsx_from_data(sheets, f"treasury_{safe}.xlsx")
    return send_file(path, as_attachment=True, download_name=f"treasury_{safe}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
