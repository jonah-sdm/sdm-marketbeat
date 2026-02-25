"""
Legal Search backend
─────────────────────
Orchestrates legal case searches across CourtListener, SEC EDGAR, and CanLII.
Aggregates results, extracts entities, and caches for repeat queries.
"""

import os
import time
from datetime import datetime

from legal_case_search import (
    make_session, search_courtlistener_opinions, search_courtlistener_dockets,
    search_sec_edgar, search_canlii, generate_search_urls,
    aggregate_entities,
)

_legal_cache = {}
LEGAL_CACHE_TTL = int(os.getenv("LEGAL_CACHE_TTL", "3600"))  # 1 hour


# Run a legal case search across all selected API sources (CourtListener, SEC EDGAR, CanLII).
# Aggregates results, extracts plaintiff/party names, and generates manual search URLs.
# Results are cached for LEGAL_CACHE_TTL seconds to avoid re-querying on repeated searches.
def run_legal_search(company, sources=None):
    cache_key = f"{company}|{','.join(sorted(sources)) if sources else 'all'}"
    if cache_key in _legal_cache and (time.time() - _legal_cache[cache_key]["ts"]) < LEGAL_CACHE_TTL:
        return _legal_cache[cache_key]["data"]
    source_map = {
        "opinions": search_courtlistener_opinions,
        "dockets": search_courtlistener_dockets,
        "sec": search_sec_edgar,
        "canlii": search_canlii,
    }
    active = sources if sources else list(source_map.keys())
    session = make_session()
    api_results = []
    for name in active:
        if name in source_map:
            api_results.append(source_map[name](session, company))
    search_urls = generate_search_urls(company)
    entities = aggregate_entities(api_results)
    result = {
        "query": company,
        "search_date": datetime.now().isoformat(),
        "sources_searched": active,
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
        "plaintiffs": entities.get("plaintiffs", []),
        "unique_plaintiff_count": len(entities.get("plaintiffs", [])),
    }
    _legal_cache[cache_key] = {"data": result, "ts": time.time()}
    return result
