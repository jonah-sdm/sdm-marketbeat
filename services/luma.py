"""
Luma Event Scraping helpers
────────────────────────────
Scrapes event details and attendee lists from Luma event pages.
Tries Luma public API first, falls back to HTML parsing, then JS rendering.
No API key required.
"""

import json
import os
import re
import time

import requests as http_requests
from bs4 import BeautifulSoup

from services.apollo import check_api_key, enrich_person_by_name

_event_cache = {}
EVENT_CACHE_TTL = int(os.getenv("EVENT_CACHE_TTL", "1800"))  # 30 min


# Try to get event details and guest list from Luma's public API endpoints.
# Takes the event slug (extracted from the lu.ma URL) and returns (event_info, attendees).
def _try_luma_api(slug):
    event_info = {}
    attendees = []

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
        }

        # Try event API
        r = http_requests.get(f"https://api.lu.ma/event/get?event_slug={slug}",
                              headers=headers, timeout=15)
        if r.status_code == 200:
            data = r.json()
            ev = data.get("event", data)
            event_info = {
                "name": ev.get("name", ""),
                "description": ev.get("description", ""),
                "date": (ev.get("start_at", "") or "")[:10],
                "time": (ev.get("start_at", "") or "")[11:16],
                "location": "",
                "host": "",
            }
            geo = ev.get("geo_address_info", {})
            if geo:
                event_info["location"] = geo.get("full_address", geo.get("city", ""))
            hosts = data.get("hosts", [])
            if hosts:
                event_info["host"] = hosts[0].get("name", "")

        # Try guest list API
        r2 = http_requests.get(
            f"https://api.lu.ma/event/get-guests?event_slug={slug}&limit=200",
            headers=headers, timeout=15,
        )
        if r2.status_code == 200:
            guest_data = r2.json()
            entries = guest_data.get("entries", guest_data.get("guests", []))
            if isinstance(entries, list):
                for entry in entries:
                    guest = entry.get("guest", entry) if isinstance(entry, dict) else {}
                    user = entry.get("user", {}) if isinstance(entry, dict) else {}
                    name = (guest.get("name") or user.get("name") or
                            f"{user.get('first_name', '')} {user.get('last_name', '')}".strip())
                    if name:
                        attendees.append({
                            "name": name,
                            "company": guest.get("company", user.get("company", "")),
                            "role": guest.get("job_title", user.get("job_title", "")),
                            "avatar": user.get("avatar_url", ""),
                        })
    except Exception:
        pass

    return event_info, attendees


# Scrape event details and publicly visible attendees from a Luma event page.
# Tries three approaches in order: (1) Luma public API, (2) HTML parsing with
# JSON-LD / __NEXT_DATA__ extraction, (3) JS rendering via requests-html (optional).
# Results are cached for EVENT_CACHE_TTL seconds to avoid re-scraping.
def scrape_luma_event(url):
    cache_key = url
    if cache_key in _event_cache and (time.time() - _event_cache[cache_key]["ts"]) < EVENT_CACHE_TTL:
        return _event_cache[cache_key]["data"], None

    event_info = {
        "name": "",
        "date": "",
        "time": "",
        "location": "",
        "host": "",
        "description": "",
        "url": url,
    }
    attendees = []

    # Extract event slug for API approach
    slug = None
    m = re.search(r'lu\.ma/([^/?#]+)', url)
    if m:
        slug = m.group(1)

    # Try the Luma API first (faster, more reliable)
    if slug:
        api_event, api_attendees = _try_luma_api(slug)
        if api_event:
            event_info.update(api_event)
        if api_attendees:
            attendees = api_attendees

    # Fall back to HTML scraping if API didn't work
    if not attendees:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml",
            }
            r = http_requests.get(url, headers=headers, timeout=20)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")

            # Try to extract event data from JSON-LD or meta tags
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    ld = json.loads(script.string)
                    if isinstance(ld, dict) and ld.get("@type") == "Event":
                        event_info["name"] = ld.get("name", event_info["name"])
                        event_info["description"] = ld.get("description", "")
                        loc = ld.get("location", {})
                        if isinstance(loc, dict):
                            event_info["location"] = loc.get("name", loc.get("address", ""))
                        start = ld.get("startDate", "")
                        if start:
                            event_info["date"] = start[:10]
                            event_info["time"] = start[11:16] if len(start) > 11 else ""
                        org = ld.get("organizer", {})
                        if isinstance(org, dict):
                            event_info["host"] = org.get("name", "")
                except (json.JSONDecodeError, TypeError):
                    pass

            # Extract from meta tags
            if not event_info["name"]:
                og_title = soup.find("meta", property="og:title")
                if og_title:
                    event_info["name"] = og_title.get("content", "")
            if not event_info["description"]:
                og_desc = soup.find("meta", property="og:description")
                if og_desc:
                    event_info["description"] = og_desc.get("content", "")

            # Try to find __NEXT_DATA__ for attendee info
            for script in soup.find_all("script", id="__NEXT_DATA__"):
                try:
                    next_data = json.loads(script.string)
                    props = next_data.get("props", {}).get("pageProps", {})

                    # Event data from Next.js
                    ev = props.get("event", props.get("initialData", {}).get("event", {}))
                    if ev:
                        event_info["name"] = ev.get("name", event_info["name"])
                        event_info["description"] = ev.get("description", event_info["description"])
                        geo = ev.get("geo_address_info", {})
                        if geo:
                            event_info["location"] = geo.get("full_address", geo.get("city", ""))
                        event_info["date"] = (ev.get("start_at", "") or "")[:10]

                    # Guest/attendee data
                    guests = props.get("guests", props.get("initialData", {}).get("guests", []))
                    if isinstance(guests, list):
                        for g in guests:
                            if isinstance(g, dict):
                                name = g.get("name", g.get("user_name", ""))
                                if not name:
                                    name = f"{g.get('first_name', '')} {g.get('last_name', '')}".strip()
                                if name:
                                    attendees.append({
                                        "name": name,
                                        "company": g.get("company", g.get("organization", "")),
                                        "role": g.get("job_title", g.get("title", "")),
                                        "avatar": g.get("avatar_url", ""),
                                    })
                except (json.JSONDecodeError, TypeError, KeyError):
                    pass

            # Try to find attendee names from visible HTML elements
            if not attendees:
                # Look for common attendee patterns in the page
                for el in soup.select('[class*="attendee"], [class*="guest"], [class*="participant"]'):
                    name_el = el.select_one('[class*="name"]')
                    if name_el and name_el.get_text(strip=True):
                        attendees.append({
                            "name": name_el.get_text(strip=True),
                            "company": "",
                            "role": "",
                        })

        except http_requests.exceptions.RequestException as e:
            if not event_info["name"]:
                return None, f"Failed to fetch event page: {str(e)}"

    # Try JS rendering as last resort if we have no attendees
    if not attendees:
        try:
            from requests_html import HTMLSession
            session = HTMLSession()
            r = session.get(url, timeout=20)
            r.html.render(timeout=15, sleep=2)

            # Re-parse with rendered HTML
            soup = BeautifulSoup(r.html.html, "html.parser")

            if not event_info["name"]:
                title_el = soup.select_one('h1, [class*="title"]')
                if title_el:
                    event_info["name"] = title_el.get_text(strip=True)

            for el in soup.select('[class*="attendee"], [class*="guest"], [class*="avatar"]'):
                name_el = el.select_one('[class*="name"]') or el
                name = name_el.get_text(strip=True)
                if name and len(name) > 1 and len(name) < 60:
                    attendees.append({
                        "name": name,
                        "company": "",
                        "role": "",
                    })
        except Exception:
            pass

    # Deduplicate attendees
    seen = set()
    unique = []
    for a in attendees:
        key = a["name"].lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(a)
    attendees = unique

    result = {"event": event_info, "attendees": attendees}
    _event_cache[cache_key] = {"data": result, "ts": time.time()}
    return result, None


# Take a list of attendees (with just name/company) and add professional contact
# details (email, phone, LinkedIn, title) by looking each person up in Apollo.io.
# Processes up to max_enrich attendees to stay within API rate limits.
def enrich_attendees_with_apollo(attendees, max_enrich=50):
    ok, _ = check_api_key()
    if not ok:
        return attendees, 0

    enriched_count = 0
    for a in attendees[:max_enrich]:
        person = enrich_person_by_name(a["name"], a.get("company"))
        if person:
            a.update({
                "title": person.get("title", a.get("role", "")),
                "email": person.get("email", ""),
                "email_status": person.get("email_status", ""),
                "phone": person.get("phone", ""),
                "linkedin_url": person.get("linkedin_url", ""),
                "city": person.get("city", ""),
                "state": person.get("state", ""),
                "country": person.get("country", ""),
                "company": person.get("company", a.get("company", "")),
                "company_domain": person.get("company_domain", ""),
                "company_industry": person.get("company_industry", ""),
                "apollo_id": person.get("apollo_id", ""),
            })
            enriched_count += 1
            time.sleep(0.2)  # rate limit

    return attendees, enriched_count
