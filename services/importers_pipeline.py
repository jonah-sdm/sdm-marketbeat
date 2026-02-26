import asyncio
import logging
from datetime import datetime, timezone

from services.cid_scraper import scrape_cid_by_country
from services.normalizer import normalize_companies
from services.importers_exporter import export_raw_json, export_clean_csv

logger = logging.getLogger(__name__)


async def run_importers_pipeline(country, max_companies=None,
                                  throttle_range=(1.5, 3.0),
                                  status_store=None):
    errors = []

    def update_status(message, phase="", progress=0, total=0):
        if status_store is not None:
            status_store["message"] = message
            status_store["phase"] = phase
            status_store["progress"] = progress
            status_store["total"] = total
            status_store["last_updated"] = datetime.now(timezone.utc).isoformat()
        logger.info(message)

    update_status("Scraping ISED Canadian Importers Database...",
                  "scraping", 0, 0)

    try:
        companies = await scrape_cid_by_country(
            country,
            max_companies=max_companies,
            progress_callback=lambda msg: update_status(msg, "scraping")
        )
    except Exception as e:
        error_msg = f"CID scrape failed: {str(e)}"
        errors.append(error_msg)
        update_status(f"Error: {error_msg}", "error")
        return [], errors

    if not companies:
        update_status("No companies found for selected country.", "complete")
        return [], errors

    update_status(f"Normalizing {len(companies)} companies...", "normalizing")
    companies = normalize_companies(companies)
    update_status(f"{len(companies)} unique companies after deduplication.",
                  "normalizing")

    update_status("Exporting results...", "exporting")
    try:
        export_raw_json(companies)
        export_clean_csv(companies)
    except Exception as e:
        errors.append(f"Export failed: {str(e)}")

    update_status(
        f"Complete! {len(companies)} companies found.",
        "complete", len(companies), len(companies)
    )
    return companies, errors
