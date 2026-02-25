"""
Event Intelligence routes
──────────────────────────
Blueprint handling all /events/* endpoints:
  /events/           — main page
  /events/scan       — API: scrape event + optional Apollo enrichment
  /events/download/* — JSON and Excel exports
"""

import json
import os
import re
import tempfile

from flask import Blueprint, request, render_template, send_file, jsonify

from services.apollo import check_api_key
from services.luma import scrape_luma_event, enrich_attendees_with_apollo
from services.excel import create_xlsx_from_data

events_bp = Blueprint("events", __name__, url_prefix="/events")


@events_bp.route("/")
def events_index():
    ok, _ = check_api_key()
    return render_template("events.html", active="events", api_ok=ok)


@events_bp.route("/scan")
def events_scan():
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "Event URL is required"}), 400

    enrich = request.args.get("enrich", "0") == "1"

    result, err = scrape_luma_event(url)
    if err:
        return jsonify({"error": err}), 400

    if not result:
        return jsonify({"error": "Could not extract event data from the provided URL"}), 400

    attendees = result["attendees"]
    enriched_count = 0

    if enrich and attendees:
        attendees, enriched_count = enrich_attendees_with_apollo(attendees)

    return jsonify({
        "event": result["event"],
        "attendees": attendees,
        "total_attendees": len(attendees),
        "enriched_count": enriched_count,
    })


@events_bp.route("/download/json")
def events_download_json():
    url = request.args.get("url", "").strip()
    if not url:
        return "Event URL required", 400

    result, err = scrape_luma_event(url)
    if err:
        return err, 400

    safe = re.sub(r'[^\w\-]', '_', result["event"].get("name", "event"))[:40]
    path = os.path.join(tempfile.gettempdir(), f"event_{safe}.json")
    with open(path, "w") as f:
        json.dump(result, f, indent=2, default=str)
    return send_file(path, as_attachment=True, download_name=f"event_{safe}.json",
                     mimetype="application/json")


@events_bp.route("/download/xlsx")
def events_download_xlsx():
    url = request.args.get("url", "").strip()
    enrich = request.args.get("enrich", "0") == "1"
    if not url:
        return "Event URL required", 400

    result, err = scrape_luma_event(url)
    if err:
        return err, 400

    attendees = result["attendees"]
    enriched_count = 0
    if enrich and attendees:
        ok, _ = check_api_key()
        if ok:
            attendees, enriched_count = enrich_attendees_with_apollo(attendees)

    event = result["event"]
    rows = []
    for a in attendees:
        rows.append([
            event.get("name", ""),
            event.get("date", ""),
            event.get("location", ""),
            a.get("name", ""),
            a.get("title", a.get("role", "")),
            a.get("company", ""),
            a.get("email", ""),
            a.get("phone", ""),
            a.get("linkedin_url", ""),
            f"{a.get('city', '')}, {a.get('state', '')}".strip(", "),
            a.get("country", ""),
        ])

    sheets = [{
        "title": f"Event Attendees"[:31],
        "headers": ["Event Name", "Event Date", "Location",
                     "Attendee Name", "Title", "Company",
                     "Email", "Phone", "LinkedIn",
                     "Location", "Country"],
        "rows": rows,
    }]

    safe = re.sub(r'[^\w\-]', '_', event.get("name", "event"))[:40]
    path = create_xlsx_from_data(sheets, f"event_{safe}.xlsx")
    return send_file(path, as_attachment=True, download_name=f"event_{safe}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
