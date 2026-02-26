import asyncio
import threading
import tempfile
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, render_template, request, send_file

from services.cid_scraper import get_country_list
from services.importers_pipeline import run_importers_pipeline
from services.importers_exporter import export_clean_csv, export_raw_json

importers_bp = Blueprint("importers", __name__, url_prefix="/importers")

_job_status = {
    "running": False,
    "job_id": None,
    "message": "Ready",
    "phase": "",
    "progress": 0,
    "total": 0,
    "last_updated": "",
    "results": None,
    "errors": [],
    "cancelled": False,
}


@importers_bp.route("/")
def importers_index():
    return render_template("importers.html", active="importers")


@importers_bp.route("/api/countries")
def api_countries():
    return jsonify({"countries": get_country_list()})


@importers_bp.route("/api/start", methods=["POST"])
def api_start():
    global _job_status
    if _job_status["running"]:
        return jsonify({"error": "A job is already running."}), 400
    data = request.get_json()
    country = data.get("country", "")
    max_companies = data.get("max_companies")
    throttle = data.get("throttle", 2.0)
    if not country:
        return jsonify({"error": "Please select a country."}), 400
    _job_status = {
        "running": True,
        "job_id": "importers",
        "message": "Starting...",
        "phase": "starting",
        "progress": 0,
        "total": 0,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "results": None,
        "errors": [],
        "cancelled": False,
    }
    throttle_range = (max(1.0, throttle - 0.5), throttle + 1.0)
    thread = threading.Thread(
        target=_run_job,
        args=(country, max_companies, throttle_range),
        daemon=True
    )
    thread.start()
    return jsonify({"status": "started"})


def _run_job(country, max_companies, throttle_range):
    global _job_status
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        companies, errors = loop.run_until_complete(
            run_importers_pipeline(
                country=country,
                max_companies=max_companies,
                throttle_range=throttle_range,
                status_store=_job_status
            )
        )
        _job_status["results"] = companies
        _job_status["errors"] = errors
        if _job_status["phase"] != "error":
            _job_status["phase"] = "complete"
            _job_status["message"] = f"Complete! {len(companies)} companies found."
    except Exception as e:
        _job_status["phase"] = "error"
        _job_status["message"] = f"Error: {str(e)}"
    finally:
        _job_status["running"] = False
        loop.close()


@importers_bp.route("/api/status")
def api_status():
    return jsonify({
        "running": _job_status["running"],
        "message": _job_status["message"],
        "phase": _job_status["phase"],
        "progress": _job_status["progress"],
        "total": _job_status["total"],
    })


@importers_bp.route("/api/cancel", methods=["POST"])
def api_cancel():
    global _job_status
    _job_status["cancelled"] = True
    _job_status["running"] = False
    _job_status["phase"] = "cancelled"
    _job_status["message"] = "Job cancelled."
    return jsonify({"status": "cancelled"})


@importers_bp.route("/api/results")
def api_results():
    results = _job_status.get("results") or []
    return jsonify({"leads": results, "errors": _job_status.get("errors", [])})


@importers_bp.route("/download/csv")
def download_csv():
    path = os.path.join(tempfile.gettempdir(), "importers_leads.csv")
    if os.path.exists(path):
        return send_file(path, as_attachment=True,
                         download_name="importers_leads.csv")
    return jsonify({"error": "No CSV available yet."}), 404


@importers_bp.route("/download/json")
def download_json():
    path = os.path.join(tempfile.gettempdir(), "importers_leads_raw.json")
    if os.path.exists(path):
        return send_file(path, as_attachment=True,
                         download_name="importers_leads_raw.json")
    return jsonify({"error": "No JSON available yet."}), 404
