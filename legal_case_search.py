#!/usr/bin/env python3
"""
Legal Case Search Tool
──────────────────────
Searches for legal cases against a company using free APIs and generates
search URLs for subscription/manual sources.

Extracts maximum detail: parties, attorneys, law firms, judges, case type,
jurisdiction, filing dates, status, docket entries, and bankruptcy info.

APIs used (free, no key):
  - CourtListener  — opinions + dockets with full party/attorney/firm data
  - SEC EDGAR EFTS — full-text search of SEC filings

API with key placeholder:
  - CanLII          — Canadian case law (requires free API key)

Search URLs generated (manual/subscription):
  - Justia, Google Scholar, DOJ, FTC, Stretto, Trellis.law
"""

import json
import os
import re
import sys
import subprocess
import urllib.parse
from datetime import datetime

# ── Auto-install dependencies ────────────────────────────────────────────
for pkg, import_name in [("requests", "requests"), ("beautifulsoup4", "bs4")]:
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "-q", "install", pkg])

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ── CanLII API Key ───────────────────────────────────────────────────────
# To enable CanLII searches:
#   1. Register at https://developer.canlii.org/
#   2. Paste your API key below
CANLII_API_KEY = os.environ.get("CANLII_API_KEY", "").strip()


# ─────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────

def make_session():
    """Session with automatic retries on 403/429/5xx."""
    s = requests.Session()
    retries = Retry(total=3, backoff_factor=1.5,
                    status_forcelist=[403, 429, 500, 502, 503, 504],
                    allowed_methods=["GET"])
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s


def api_get(session, url, headers=None, timeout=15):
    """GET with unified error handling. Returns (json_dict | None, error_str | None)."""
    default_headers = {
        "User-Agent": "LegalCaseSearchTool/1.0 (research; contact@example.com)",
        "Accept": "application/json",
    }
    try:
        r = session.get(url, headers=headers or default_headers, timeout=timeout)
        r.raise_for_status()
        return r.json(), None
    except requests.exceptions.RetryError:
        return None, "Blocked after 3 retries (403/429)"
    except requests.exceptions.HTTPError as e:
        return None, f"HTTP {e.response.status_code}"
    except requests.exceptions.ConnectionError:
        return None, "Connection failed"
    except requests.exceptions.Timeout:
        return None, "Request timed out"
    except json.JSONDecodeError:
        return None, "Invalid JSON response"
    except Exception as e:
        return None, str(e)


def _extract_int(value):
    """Safely pull an integer out of a value that might be int, dict, or str."""
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        return _extract_int(value.get("value", value.get("total", 0)))
    try:
        return int(str(value).replace(",", ""))
    except (ValueError, TypeError):
        return 0


# ─────────────────────────────────────────────────────────────────────────
# Entity classification
# ─────────────────────────────────────────────────────────────────────────

_CORP_SUFFIXES = re.compile(
    r"\b(Inc\.?|LLC|LLP|Ltd\.?|L\.?P\.?|Corp\.?|Corporation|Company|Co\.|"
    r"Group|Holdings|Partners|Associates|Pte|S\.?A\.?|GmbH|AG|PLC|N\.?V\.?)\s*$",
    re.IGNORECASE,
)
_GOV_PATTERNS = re.compile(
    r"^(United States|U\.?S\.?A?\.?|People of|State of|Commonwealth of|"
    r"Securities and Exchange Commission|SEC|Federal Trade Commission|FTC|"
    r"CFTC|DOJ|EEOC|NLRB|EPA|Department of|Internal Revenue|"
    r"Office of the United States)\b",
    re.IGNORECASE,
)
_MONEY_PATTERN = re.compile(r"^\$[\d,.]+$")
_LAW_FIRM_HINTS = re.compile(
    r"(Law\s+(Office|Firm|Group)|Attorney|Counsel|LLP|Esq\.?|"
    r"& (Stockton|Associates|Partners))",
    re.IGNORECASE,
)


def classify_party(name):
    """Classify a party name as 'company', 'government', 'individual', or 'monetary'."""
    if not name or not name.strip():
        return "unknown"
    name = name.strip()
    if _MONEY_PATTERN.match(name):
        return "monetary"
    if _GOV_PATTERNS.match(name):
        return "government"
    if _CORP_SUFFIXES.search(name):
        return "company"
    # Names in ALL CAPS with 2+ words and no corp suffix → likely individual
    if name.isupper() and len(name.split()) >= 2:
        return "individual"
    # If it has a comma (Last, First) → individual
    if re.match(r"^[A-Z][a-z]+,\s+[A-Z]", name):
        return "individual"
    # Short names (2-3 words, mixed case, no corp suffix) → likely individual
    words = name.split()
    if 1 < len(words) <= 4 and not any(w[0].islower() for w in words if w):
        return "individual"
    return "company"


def classify_firm(name):
    """Check if a string looks like a law firm name."""
    if not name:
        return False
    return bool(_LAW_FIRM_HINTS.search(name)) or ", LLP" in name or ", LLC" in name


def extract_plaintiff(case_name):
    """Extract the plaintiff from a case name string."""
    if not case_name or case_name.strip() in ("", "Unknown", "v.", "N/A"):
        return None
    name = case_name.strip()
    if re.match(r"^In\s+(Re|the Matter of)\b", name, re.IGNORECASE):
        return re.sub(r",?\s*(et\s+al\.?|etc\.?)$", "", name).strip() or None
    parts = re.split(r"\s+v\.?\s+|\s+vs\.?\s+", name, maxsplit=1)
    plaintiff_raw = parts[0].strip()
    plaintiff = re.sub(r",?\s*(et\s+al\.?|etc\.?)$", "", plaintiff_raw).strip()
    return plaintiff if plaintiff else None


def extract_defendant(case_name):
    """Extract the defendant from a case name string."""
    if not case_name or case_name.strip() in ("", "Unknown", "v.", "N/A"):
        return None
    parts = re.split(r"\s+v\.?\s+|\s+vs\.?\s+", case_name.strip(), maxsplit=1)
    if len(parts) < 2:
        return None
    defendant = re.sub(r",?\s*(et\s+al\.?|etc\.?)$", "", parts[1]).strip()
    return defendant if defendant else None


def clean_sec_entity(raw):
    """Strip CIK/ticker noise from SEC entity name."""
    if not raw or raw == "Unknown":
        return None
    cleaned = re.sub(r"\s*\(CIK\s+\d+\)", "", raw)
    cleaned = re.sub(r"\s*\([A-Z]{1,5}\)", "", cleaned)
    return cleaned.strip() or None


def parse_attorney_string(attorney_str):
    """Parse CourtListener's attorney string into individual names + firms."""
    if not attorney_str:
        return [], []
    attorneys = []
    firms = []
    # Split on common delimiters
    for segment in re.split(r"[,;]|\.\s+(?=[A-Z])", attorney_str):
        segment = segment.strip().rstrip(".")
        if not segment or len(segment) < 3:
            continue
        # Skip city/state fragments
        if re.match(r"^[A-Z][a-z]+$", segment) and len(segment) < 15:
            continue
        if segment.startswith("for "):
            continue
        if _LAW_FIRM_HINTS.search(segment) or _CORP_SUFFIXES.search(segment):
            firms.append(segment)
        elif re.match(r"^[A-Z][a-z]+ [A-Z]", segment):
            attorneys.append(segment)
    return attorneys, firms


# ─────────────────────────────────────────────────────────────────────────
# API Sources (return detailed data)
# ─────────────────────────────────────────────────────────────────────────

def search_courtlistener_opinions(session, company):
    """CourtListener v4 — opinion search with full detail extraction."""
    q = urllib.parse.quote(f'"{company}"')
    url = f"https://www.courtlistener.com/api/rest/v4/search/?q={q}&type=o"
    data, err = api_get(session, url)
    base_url = f"https://www.courtlistener.com/?q=%22{q}%22&type=o"
    if err:
        return {"source": "CourtListener (Opinions)", "count": None, "cases": [], "error": err, "url": base_url}

    count = _extract_int(data.get("count", 0))
    cases = []
    for hit in data.get("results", [])[:10]:
        name = hit.get("caseName", "Unknown")
        full_name = hit.get("caseNameFull", "")
        atty_str = hit.get("attorney", "")
        parsed_attys, parsed_firms = parse_attorney_string(atty_str)

        case = {
            "name": name,
            "case_name_full": full_name,
            "plaintiff": extract_plaintiff(full_name or name),
            "defendant": extract_defendant(full_name or name),
            "parties": {
                "from_full_name": [p.strip() for p in re.split(r"\s+v\.?\s+", full_name) if p.strip()] if full_name else [],
            },
            "judge": hit.get("judge", ""),
            "panel_names": hit.get("panel_names", []),
            "attorneys_raw": atty_str,
            "attorneys": parsed_attys,
            "law_firms": parsed_firms,
            "court": hit.get("court", ""),
            "court_id": hit.get("court_id", ""),
            "jurisdiction": hit.get("court_jurisdiction", ""),
            "date_filed": hit.get("dateFiled", ""),
            "date_argued": hit.get("dateArgued", ""),
            "status": hit.get("status", ""),
            "case_type": hit.get("suitNature", ""),
            "posture": hit.get("posture", ""),
            "procedural_history": hit.get("procedural_history", ""),
            "syllabus": hit.get("syllabus", ""),
            "docket_number": hit.get("docketNumber", ""),
            "citations": hit.get("citation", []),
            "cite_count": hit.get("citeCount", 0),
            "docket_url": f"https://www.courtlistener.com/docket/{hit.get('docket_id', '')}/",
            "opinion_url": f"https://www.courtlistener.com{hit.get('absolute_url', '')}",
        }
        cases.append(case)
    return {"source": "CourtListener (Opinions)", "count": count, "cases": cases, "error": None, "url": base_url}


def search_courtlistener_dockets(session, company):
    """CourtListener v4 — docket/RECAP search with parties, firms, judges."""
    q = urllib.parse.quote(f'"{company}"')
    url = f"https://www.courtlistener.com/api/rest/v4/search/?q={q}&type=r"
    data, err = api_get(session, url)
    base_url = f"https://www.courtlistener.com/?q=%22{q}%22&type=r"
    if err:
        return {"source": "CourtListener (Dockets)", "count": None, "cases": [], "error": err, "url": base_url}

    count = _extract_int(data.get("count", 0))
    cases = []
    for hit in data.get("results", [])[:10]:
        name = hit.get("caseName", hit.get("case_name", "Unknown"))
        raw_parties = hit.get("party", []) or []
        raw_firms = hit.get("firm", []) or []
        raw_attorneys = hit.get("attorney", []) or []

        # Classify each party
        parties_classified = []
        for p in raw_parties:
            ptype = classify_party(p)
            parties_classified.append({"name": p, "type": ptype})

        # Separate firms into law firms vs other
        law_firms = [f for f in raw_firms if f]

        # Extract document descriptions as case summary snippets
        doc_summaries = []
        for doc in (hit.get("recap_documents", []) or [])[:5]:
            desc = doc.get("description", "")
            if desc:
                doc_summaries.append({
                    "description": desc,
                    "date": doc.get("entry_date_filed", ""),
                    "doc_number": doc.get("document_number", ""),
                })

        case = {
            "name": name,
            "plaintiff": extract_plaintiff(name),
            "defendant": extract_defendant(name),
            "parties_all": parties_classified,
            "companies": [p["name"] for p in parties_classified if p["type"] == "company"],
            "individuals": [p["name"] for p in parties_classified if p["type"] == "individual"],
            "government_parties": [p["name"] for p in parties_classified if p["type"] == "government"],
            "attorneys": raw_attorneys,
            "law_firms": law_firms,
            "judge": hit.get("assignedTo", ""),
            "referred_to": hit.get("referredTo", ""),
            "court": hit.get("court", ""),
            "court_id": hit.get("court_id", ""),
            "jurisdiction_type": hit.get("jurisdictionType", ""),
            "case_type": hit.get("suitNature", ""),
            "cause": hit.get("cause", ""),
            "date_filed": hit.get("dateFiled", hit.get("date_filed", "")),
            "date_terminated": hit.get("dateTerminated", ""),
            "date_argued": hit.get("dateArgued", ""),
            "docket_number": hit.get("docketNumber", hit.get("docket_number", "")),
            "pacer_case_id": hit.get("pacer_case_id", ""),
            "jury_demand": hit.get("juryDemand", ""),
            "chapter": hit.get("chapter", ""),
            "trustee": hit.get("trustee_str", ""),
            "docket_entries": doc_summaries,
            "docket_url": f"https://www.courtlistener.com{hit.get('docket_absolute_url', '')}",
        }
        cases.append(case)
    return {"source": "CourtListener (Dockets)", "count": count, "cases": cases, "error": None, "url": base_url}


def search_sec_edgar(session, company):
    """SEC EDGAR full-text search (EFTS API, free, no key)."""
    q = urllib.parse.quote(f'"{company}"')
    url = f"https://efts.sec.gov/LATEST/search-index?q={q}"
    headers = {"User-Agent": "LegalCaseSearch research@example.com", "Accept": "application/json"}
    data, err = api_get(session, url, headers=headers)
    base_url = f"https://efts.sec.gov/LATEST/search-index?q={q}"
    if err:
        return {"source": "SEC EDGAR (Full-Text)", "count": None, "cases": [], "error": err, "url": base_url}

    total = data.get("hits", {}).get("total", 0)
    count = _extract_int(total)
    cases = []
    for hit in data.get("hits", {}).get("hits", [])[:10]:
        src = hit.get("_source", {})
        names = src.get("display_names", [])
        entity_raw = names[0] if names else "Unknown"
        case = {
            "entity": entity_raw,
            "company": clean_sec_entity(entity_raw),
            "plaintiff": clean_sec_entity(entity_raw),
            "form_type": src.get("form_type", ""),
            "file_date": src.get("file_date", ""),
            "file_description": src.get("file_description", ""),
            "period_of_report": src.get("period_of_report", ""),
            "all_display_names": names,
        }
        cases.append(case)
    return {"source": "SEC EDGAR (Full-Text)", "count": count, "cases": cases, "error": None, "url": base_url}


def search_canlii(session, company):
    """CanLII — Canadian case law (requires free API key)."""
    base_url = f"https://www.canlii.org/en/search/search.do?text=%22{urllib.parse.quote(company)}%22"
    if not CANLII_API_KEY:
        return {"source": "CanLII (Canada)", "count": None, "cases": [],
                "error": "No API key configured (see CANLII_API_KEY in script)", "url": base_url}

    q = urllib.parse.quote(f'"{company}"')
    url = f"https://api.canlii.org/v1/caseBrowse/en/?query={q}&api_key={CANLII_API_KEY}"
    data, err = api_get(session, url)
    if err:
        return {"source": "CanLII (Canada)", "count": None, "cases": [], "error": err, "url": base_url}

    cases = []
    results = data if isinstance(data, list) else data.get("results", [])
    for hit in results[:10]:
        name = hit.get("title", "Unknown")
        cases.append({
            "name": name,
            "plaintiff": extract_plaintiff(name),
            "defendant": extract_defendant(name),
            "citation": hit.get("citation", ""),
            "database": hit.get("databaseId", ""),
        })
    return {"source": "CanLII (Canada)", "count": len(results), "cases": cases, "error": None, "url": base_url}


# ─────────────────────────────────────────────────────────────────────────
# URL-only sources (manual / subscription required)
# ─────────────────────────────────────────────────────────────────────────

def generate_search_urls(company):
    """Generate search URLs for sources that can't be queried via free API."""
    q = urllib.parse.quote(f'"{company}"')
    q_plain = urllib.parse.quote(company)
    return [
        {"source": "Justia", "url": f"https://www.justia.com/search?q={q}",
         "note": "Free — browse results manually"},
        {"source": "Google Scholar (Case Law)",
         "url": f"https://scholar.google.com/scholar?q={q}&hl=en&as_sdt=4",
         "note": "Free — blocks automated scrapers, open in browser"},
        {"source": "DOJ (Dept of Justice)",
         "url": f"https://search.justice.gov/search?query={q}&op=Search&affiliate=justice",
         "note": "Free — federal enforcement actions and press releases"},
        {"source": "FTC (Federal Trade Commission)",
         "url": f"https://www.ftc.gov/legal-library?search_api_fulltext={q_plain}",
         "note": "Free — consumer protection and antitrust cases"},
        {"source": "Stretto (Bankruptcy)", "url": f"https://cases.stretto.com/search?q={q_plain}",
         "note": "Free — bankruptcy and restructuring cases"},
        {"source": "Trellis.law (State Courts)", "url": f"https://trellis.law/search?q={q_plain}",
         "note": "Subscription required — state trial court analytics"},
    ]


# ─────────────────────────────────────────────────────────────────────────
# Aggregation — collect unique entities across all results
# ─────────────────────────────────────────────────────────────────────────

def aggregate_entities(api_results):
    """Walk all cases and collect unique parties, companies, law firms, attorneys, judges."""
    seen_parties = {}       # name -> {type, sources}
    seen_companies = {}     # name -> sources list
    seen_firms = {}         # name -> sources list
    seen_attorneys = {}     # name -> sources list
    seen_judges = {}        # name -> sources list
    plaintiffs = []
    seen_plaintiff = set()

    for r in api_results:
        src_name = r["source"]
        for c in r.get("cases", []):
            # Plaintiffs
            p = c.get("plaintiff")
            if p and p not in seen_plaintiff:
                seen_plaintiff.add(p)
                plaintiffs.append({"name": p, "source": src_name,
                                   "case": c.get("name", c.get("entity", ""))})

            # Classified parties (from docket search)
            for party in c.get("parties_all", []):
                pname = party["name"]
                if pname not in seen_parties:
                    seen_parties[pname] = {"type": party["type"], "sources": []}
                if src_name not in seen_parties[pname]["sources"]:
                    seen_parties[pname]["sources"].append(src_name)

            # Companies
            for co in c.get("companies", []):
                if co and co not in seen_companies:
                    seen_companies[co] = []
                if co:
                    if src_name not in seen_companies[co]:
                        seen_companies[co].append(src_name)
            # SEC company
            co = c.get("company")
            if co:
                if co not in seen_companies:
                    seen_companies[co] = []
                if src_name not in seen_companies[co]:
                    seen_companies[co].append(src_name)

            # Law firms
            for f in c.get("law_firms", []):
                if f and f not in seen_firms:
                    seen_firms[f] = []
                if f:
                    if src_name not in seen_firms[f]:
                        seen_firms[f].append(src_name)

            # Attorneys
            for a in c.get("attorneys", []):
                if a and a not in seen_attorneys:
                    seen_attorneys[a] = []
                if a:
                    if src_name not in seen_attorneys[a]:
                        seen_attorneys[a].append(src_name)

            # Judges
            judge = c.get("judge", "")
            if judge:
                if judge not in seen_judges:
                    seen_judges[judge] = []
                if src_name not in seen_judges[judge]:
                    seen_judges[judge].append(src_name)
            for pn in c.get("panel_names", []) or []:
                if pn and pn not in seen_judges:
                    seen_judges[pn] = []
                if pn and src_name not in seen_judges[pn]:
                    seen_judges[pn].append(src_name)

    return {
        "plaintiffs": plaintiffs,
        "parties": [{"name": k, **v} for k, v in seen_parties.items()],
        "companies": [{"name": k, "sources": v} for k, v in seen_companies.items()],
        "law_firms": [{"name": k, "sources": v} for k, v in seen_firms.items()],
        "attorneys": [{"name": k, "sources": v} for k, v in seen_attorneys.items()],
        "judges": [{"name": k, "sources": v} for k, v in seen_judges.items()],
    }


# Keep backwards compat for web_search.py
def collect_plaintiffs(api_results):
    return aggregate_entities(api_results)["plaintiffs"]


# ─────────────────────────────────────────────────────────────────────────
# Display and export
# ─────────────────────────────────────────────────────────────────────────

W = 76

def print_header(company):
    print(f"\n{'=' * W}")
    print(f"  LEGAL CASE SEARCH: \"{company}\"")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * W}")


def print_api_result(result):
    tag = result["source"]
    if result["error"]:
        print(f"\n  [{tag}]  ERROR: {result['error']}")
    elif result["count"] == 0:
        print(f"\n  [{tag}]  0 results")
    else:
        print(f"\n  [{tag}]  {result['count']} result(s)")
        for i, c in enumerate(result["cases"][:5], 1):
            name = c.get("name", c.get("entity", "Unknown"))
            lines = [f"    {i}. {name}"]

            plaintiff = c.get("plaintiff")
            defendant = c.get("defendant")
            if plaintiff:
                role_line = f"       Plaintiff: {plaintiff}"
                if defendant:
                    role_line += f"  vs  Defendant: {defendant}"
                lines.append(role_line)

            detail_parts = []
            for key in ("court", "case_type", "cause", "jurisdiction_type",
                        "date_filed", "date_terminated", "file_date",
                        "form_type", "docket_number"):
                v = c.get(key)
                if v:
                    label = key.replace("_", " ").title()
                    detail_parts.append(f"{label}: {v}")
            if detail_parts:
                lines.append(f"       {' | '.join(detail_parts)}")

            judge = c.get("judge")
            if judge:
                lines.append(f"       Judge: {judge}")

            firms = c.get("law_firms", [])
            if firms:
                lines.append(f"       Law firms: {', '.join(firms[:3])}")

            parties = c.get("companies", [])
            if parties:
                lines.append(f"       Companies: {', '.join(parties[:5])}")

            trustee = c.get("trustee")
            chapter = c.get("chapter")
            if trustee or chapter:
                bk = "       Bankruptcy:"
                if chapter:
                    bk += f" Ch.{chapter}"
                if trustee:
                    bk += f" Trustee: {trustee}"
                lines.append(bk)

            print("\n".join(lines))

        if result["count"] > 5:
            print(f"    ... and {result['count'] - 5} more")


def print_entity_summary(entities):
    """Print counts and lists of unique entities found."""
    sections = [
        ("PARTIES", "parties", lambda e: f"{e['name']} ({e['type']})"),
        ("COMPANIES", "companies", lambda e: e["name"]),
        ("LAW FIRMS", "law_firms", lambda e: e["name"]),
        ("ATTORNEYS", "attorneys", lambda e: e["name"]),
        ("JUDGES", "judges", lambda e: e["name"]),
    ]
    for title, key, fmt in sections:
        items = entities.get(key, [])
        if not items:
            continue
        print(f"\n{'=' * W}")
        print(f"  {title} ({len(items)} unique)")
        print(f"{'=' * W}")
        for i, item in enumerate(items, 1):
            print(f"    {i:>3}. {fmt(item)}")


def print_summary(api_results, search_urls, entities):
    print(f"\n{'=' * W}")
    print(f"  SOURCE SUMMARY")
    print(f"{'=' * W}")
    print(f"  {'Source':<35} {'Cases':>8}  {'Status'}")
    print(f"  {'─' * 35} {'─' * 8}  {'─' * 22}")
    total = 0
    for r in api_results:
        cnt = r["count"]
        if r["error"]:
            status = f"Error: {r['error'][:28]}"
            cnt_str = "—"
        elif cnt is not None:
            status = "OK"
            cnt_str = str(cnt)
            total += cnt
        else:
            status = "No data"
            cnt_str = "—"
        print(f"  {r['source']:<35} {cnt_str:>8}  {status}")
    print(f"  {'─' * 35} {'─' * 8}")
    print(f"  {'TOTAL (API sources)':<35} {total:>8}")

    # Entity counts
    print(f"\n  {'─' * 35}")
    print(f"  Unique parties:    {len(entities.get('parties', []))}")
    print(f"  Unique companies:  {len(entities.get('companies', []))}")
    print(f"  Unique law firms:  {len(entities.get('law_firms', []))}")
    print(f"  Unique attorneys:  {len(entities.get('attorneys', []))}")
    print(f"  Unique judges:     {len(entities.get('judges', []))}")

    print_entity_summary(entities)

    print(f"\n{'=' * W}")
    print(f"  MANUAL SEARCH URLs")
    print(f"{'=' * W}")
    for s in search_urls:
        print(f"\n  {s['source']} — {s['note']}")
        print(f"    {s['url']}")


def export_json(api_results, search_urls, company, filepath, entities):
    output = {
        "query": company,
        "search_date": datetime.now().isoformat(),
        "total_from_apis": sum(r["count"] for r in api_results if isinstance(r.get("count"), int)),
        "entity_counts": {
            "parties": len(entities.get("parties", [])),
            "companies": len(entities.get("companies", [])),
            "law_firms": len(entities.get("law_firms", [])),
            "attorneys": len(entities.get("attorneys", [])),
            "judges": len(entities.get("judges", [])),
            "plaintiffs": len(entities.get("plaintiffs", [])),
        },
        "api_results": api_results,
        "entities": entities,
        "manual_search_urls": search_urls,
        # Keep backwards compat keys
        "plaintiffs": entities.get("plaintiffs", []),
        "unique_plaintiff_count": len(entities.get("plaintiffs", [])),
    }
    with open(filepath, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Results saved to: {filepath}")


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) > 1:
        company = sys.argv[1]
    else:
        company = input("Enter company name to search: ").strip()
        if not company:
            print("No company name provided.")
            sys.exit(1)

    output_file = sys.argv[2] if len(sys.argv) > 2 else "legal_search_results.json"

    print_header(company)
    session = make_session()

    print(f"\n  Querying APIs...")
    api_results = []
    for label, fn in [
        ("CourtListener Opinions", search_courtlistener_opinions),
        ("CourtListener Dockets", search_courtlistener_dockets),
        ("SEC EDGAR", search_sec_edgar),
        ("CanLII", search_canlii),
    ]:
        print(f"    {label}...", end=" ", flush=True)
        result = fn(session, company)
        api_results.append(result)
        if result["error"]:
            print("[error]")
        else:
            print(f"[{result['count']} found]")

    search_urls = generate_search_urls(company)
    entities = aggregate_entities(api_results)

    print(f"\n{'=' * W}")
    print(f"  API RESULTS (detailed)")
    print(f"{'=' * W}")
    for r in api_results:
        print_api_result(r)

    print_summary(api_results, search_urls, entities)
    export_json(api_results, search_urls, company, output_file, entities)

    print(f"\n{'=' * W}")
    print(f"  Done.")
    print(f"{'=' * W}\n")


if __name__ == "__main__":
    main()
