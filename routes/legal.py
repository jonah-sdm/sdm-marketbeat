"""
Legal & Litigation Intelligence routes
────────────────────────────────────────
Blueprint handling all /legal/* endpoints:
  /legal/           — search page
  /legal/search     — API: run search
  /legal/download/* — JSON and Excel exports
"""

import json
import os
import re
import subprocess
import sys
import tempfile

from flask import Blueprint, request, render_template, send_file, jsonify

from services.legal import run_legal_search
from services.excel import create_xlsx_from_data

legal_bp = Blueprint("legal", __name__, url_prefix="/legal")


@legal_bp.route("/")
def legal_index():
    return render_template("legal.html", active="legal")


@legal_bp.route("/search")
def legal_search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "No query"}), 400
    sources_param = request.args.get("sources", "").strip()
    sources = [s.strip() for s in sources_param.split(",") if s.strip()] if sources_param else None
    return jsonify(run_legal_search(q, sources=sources))


@legal_bp.route("/download/json")
def legal_download_json():
    q = request.args.get("q", "").strip()
    if not q:
        return "No query", 400
    data = run_legal_search(q)
    safe_name = re.sub(r'[^\w\-]', '_', q)
    path = os.path.join(tempfile.gettempdir(), f"legal_search_{safe_name}.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    return send_file(path, as_attachment=True, download_name=f"legal_search_{q}.json",
                     mimetype="application/json")


@legal_bp.route("/download/xlsx")
def legal_download_xlsx():
    q = request.args.get("q", "").strip()
    if not q:
        return "No query", 400
    data = run_legal_search(q)
    safe_name = re.sub(r'[^\w\-]', '_', q)

    # Try using the existing json_to_excel.py for rich formatting
    json_path = os.path.join(tempfile.gettempdir(), f"legal_search_{safe_name}.json")
    xlsx_path = os.path.join(tempfile.gettempdir(), f"legal_search_{safe_name}.xlsx")
    with open(json_path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "json_to_excel.py")
    if os.path.exists(script):
        result = subprocess.run(
            [sys.executable, script, json_path, xlsx_path],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            return send_file(xlsx_path, as_attachment=True,
                             download_name=f"legal_search_{q}.xlsx",
                             mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    # Fallback: build Excel inline
    sheets = []
    # Cases sheet
    case_rows = []
    for src in data.get("api_results", []):
        for c in src.get("cases", []):
            case_rows.append([
                src["source"],
                c.get("name", c.get("entity", "")),
                c.get("plaintiff", ""),
                c.get("defendant", ""),
                c.get("court", ""),
                c.get("date_filed", c.get("file_date", "")),
                c.get("docket_number", ""),
                c.get("file_description", ""),
            ])
    sheets.append({
        "title": "Cases",
        "headers": ["Source", "Case Name", "Plaintiff", "Defendant", "Court", "Date Filed", "Docket #", "Description"],
        "rows": case_rows,
    })
    # Parties sheet
    party_rows = [[p["name"], p.get("source", ""), p.get("case", "")]
                  for p in data.get("plaintiffs", [])]
    sheets.append({
        "title": "Plaintiffs & Parties",
        "headers": ["Name", "Source", "Case"],
        "rows": party_rows,
    })
    # Search URLs
    url_rows = [[s["source"], s["url"], s["note"]]
                for s in data.get("manual_search_urls", [])]
    sheets.append({
        "title": "Manual Search URLs",
        "headers": ["Source", "URL", "Notes"],
        "rows": url_rows,
    })

    path = create_xlsx_from_data(sheets, f"legal_search_{safe_name}.xlsx")
    return send_file(path, as_attachment=True,
                     download_name=f"legal_search_{q}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
