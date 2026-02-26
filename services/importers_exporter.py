import csv
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def get_best_email(emails):
    if not emails:
        return "", "unknown"
    priority = ["sales", "bizdev", "info", "support",
                "accounting", "ap", "treasury", "finance"]
    for keyword in priority:
        for email in emails:
            if keyword in email.lower():
                return email, keyword
    return emails[0], "unknown"


def export_raw_json(leads):
    path = os.path.join(tempfile.gettempdir(), "importers_leads_raw.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, ensure_ascii=False, default=str)
    return path


def export_clean_csv(leads):
    path = os.path.join(tempfile.gettempdir(), "importers_leads.csv")
    fieldnames = [
        "Company", "Website", "Phone", "Email", "City", "Province",
        "CountryOfOrigin", "BusinessNumber", "SourceURL",
        "ConfidenceScore", "EmailType", "LastEnrichedAt"
    ]
    rows = []
    for lead in leads:
        enrichment = lead.get("enrichment", {})
        emails = enrichment.get("emails_found", [])
        phones = enrichment.get("phones_found", [])
        best_email, email_type = get_best_email(emails)
        best_phone = phones[0] if phones else ""
        confidence_score = int(enrichment.get("match_confidence", 0) * 100)
        rows.append({
            "Company": lead.get("cid_company_name", ""),
            "Website": enrichment.get("selected_website", ""),
            "Phone": best_phone,
            "Email": best_email,
            "City": lead.get("cid_city", ""),
            "Province": lead.get("cid_province", ""),
            "CountryOfOrigin": lead.get("country_of_origin_selected", ""),
            "BusinessNumber": lead.get("cid_business_number", ""),
            "SourceURL": lead.get("cid_page_url", ""),
            "ConfidenceScore": confidence_score,
            "EmailType": email_type,
            "LastEnrichedAt": datetime.now(timezone.utc).isoformat(),
        })
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path
