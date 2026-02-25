"""
Apollo.io API helpers
─────────────────────
Handles all communication with the Apollo.io people/match API.
Used by Treasury sector (find CFOs/Treasurers) and Event Intelligence
sector (enrich attendee names with contact details).

Requires APOLLO_API_KEY environment variable.
"""

import os
import time

import requests as http_requests
from dotenv import load_dotenv

load_dotenv()

APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "").strip()
API_BASE = os.getenv("APOLLO_API_BASE", "https://api.apollo.io/api/v1")

TREASURY_TITLES = [
    "Treasurer", "Treasury Manager", "Treasury Director", "Head of Treasury",
    "VP Treasury", "Treasury Analyst", "Treasury Operations",
    "Chief Financial Officer", "CFO", "Finance Director", "Head of Finance",
    "VP Finance", "Controller", "Director of Finance", "Financial Controller",
]

TITLE_SETS = {
    "treasury": TREASURY_TITLES[:7],
    "cfo": TREASURY_TITLES[7:],
    "all": TREASURY_TITLES,
}


# Check whether the Apollo API key is present and valid-looking
def check_api_key():
    if not APOLLO_API_KEY or APOLLO_API_KEY == "your_key_here":
        return False, (
            "Apollo.io API key not configured. "
            "Edit your .env file and set APOLLO_API_KEY=your_actual_key"
        )
    return True, ""


# Build the auth headers required by every Apollo API request
def _apollo_headers():
    return {"Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY}


# Send a POST request to an Apollo API endpoint; returns (json_data, error_string)
def _apollo_post(endpoint, body):
    url = f"{API_BASE}/{endpoint}"
    try:
        r = http_requests.post(url, json=body, headers=_apollo_headers(), timeout=30)
        if r.status_code == 401:
            return None, "Invalid API key"
        if r.status_code == 403:
            return None, f"Endpoint not accessible: {endpoint}"
        if r.status_code == 429:
            return None, "Rate limit exceeded — wait and retry"
        r.raise_for_status()
        return r.json(), None
    except http_requests.exceptions.HTTPError as e:
        return None, f"HTTP {e.response.status_code}"
    except http_requests.exceptions.ConnectionError:
        return None, "Cannot reach Apollo.io"
    except http_requests.exceptions.Timeout:
        return None, "Request timed out"
    except Exception as e:
        return None, str(e)


# Look up a single person at a company by job title using Apollo's /people/match endpoint.
# Returns a dict with contact info (name, email, phone, LinkedIn, etc.) or None if not found.
def match_person_at_company(company_name, company_domain, title):
    body = {
        "organization_name": company_name,
        "title": title,
        "reveal_personal_emails": False,
    }
    if company_domain:
        body["organization_domain"] = company_domain

    data, err = _apollo_post("people/match", body)
    if err:
        return None
    person = data.get("person")
    if not person:
        return None

    org = person.get("organization", {}) or {}
    name = person.get("name", "")
    first = person.get("first_name", "")
    if not name and not first:
        name = "(name redacted — paid plan)"

    emp = person.get("employment_history", [])
    current_role = ""
    if emp:
        for e in emp:
            if e.get("current"):
                current_role = e.get("title", "")
                break

    return {
        "name": name,
        "first_name": first,
        "last_name": person.get("last_name", ""),
        "title": person.get("title", current_role or title),
        "headline": person.get("headline", ""),
        "seniority": person.get("seniority", ""),
        "departments": person.get("departments", []),
        "functions": person.get("functions", []),
        "email": person.get("email", ""),
        "email_status": person.get("email_status", ""),
        "phone": person.get("phone_number", ""),
        "linkedin_url": person.get("linkedin_url", ""),
        "city": person.get("city", ""),
        "state": person.get("state", ""),
        "country": person.get("country", ""),
        "company": org.get("name", company_name),
        "company_domain": org.get("primary_domain", company_domain),
        "company_website": org.get("website_url", ""),
        "company_industry": org.get("industry", ""),
        "company_size": org.get("estimated_num_employees", ""),
        "company_founded": org.get("founded_year", ""),
        "apollo_id": person.get("id", ""),
        "confirmed_exists": True,
    }


# For each company in the list, try every job title and collect unique matching contacts.
# Deduplicates by Apollo ID to avoid returning the same person twice.
def find_people_at_companies(companies, titles, max_companies=10):
    people = []
    seen = set()
    for co in companies[:max_companies]:
        for title in titles:
            person = match_person_at_company(co["name"], co.get("domain", ""), title)
            if not person:
                continue
            uid = person.get("apollo_id") or f"{person.get('name','')}|{person.get('title','')}"
            if uid in seen:
                continue
            seen.add(uid)
            people.append(person)
            time.sleep(0.15)
    return people


# Look up a person by first/last name (and optionally company) via Apollo /people/match.
# Used by Event Intelligence to enrich attendee names with contact details.
def enrich_person_by_name(name, company=None):
    body = {"reveal_personal_emails": False}
    parts = name.strip().split()
    if len(parts) >= 2:
        body["first_name"] = parts[0]
        body["last_name"] = " ".join(parts[1:])
    else:
        body["first_name"] = name
        body["last_name"] = ""
    if company:
        body["organization_name"] = company

    data, err = _apollo_post("people/match", body)
    if err or not data:
        return None
    person = data.get("person")
    if not person:
        return None

    org = person.get("organization", {}) or {}
    return {
        "name": person.get("name", name),
        "first_name": person.get("first_name", ""),
        "last_name": person.get("last_name", ""),
        "title": person.get("title", ""),
        "headline": person.get("headline", ""),
        "email": person.get("email", ""),
        "email_status": person.get("email_status", ""),
        "phone": person.get("phone_number", ""),
        "linkedin_url": person.get("linkedin_url", ""),
        "city": person.get("city", ""),
        "state": person.get("state", ""),
        "country": person.get("country", ""),
        "company": org.get("name", company or ""),
        "company_domain": org.get("primary_domain", ""),
        "company_website": org.get("website_url", ""),
        "company_industry": org.get("industry", ""),
        "apollo_id": person.get("id", ""),
    }
