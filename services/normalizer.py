import re
import logging

logger = logging.getLogger(__name__)

COMPANY_SUFFIXES = [
    r'\bINC\.?\b', r'\bLTD\.?\b', r'\bLIMITED\b', r'\bCORP\.?\b',
    r'\bCORPORATION\b', r'\bCO\.?\b', r'\bLLC\b', r'\bLLP\b',
    r'\bLP\b', r'\bL\.P\.\b', r'\bP\.C\.\b', r'\bS\.A\.\b',
    r'\bGMBH\b', r'\bAG\b', r'\bPLC\b', r'\bPTE\b',
    r'\bENTERPRISES?\b', r'\bINTERNATIONAL\b',
]

PROVINCE_ABBREVS = {
    "alberta": "AB", "british columbia": "BC", "manitoba": "MB",
    "new brunswick": "NB", "newfoundland and labrador": "NL",
    "newfoundland": "NL", "northwest territories": "NT",
    "nova scotia": "NS", "nunavut": "NU", "ontario": "ON",
    "prince edward island": "PE", "quebec": "QC",
    "saskatchewan": "SK", "yukon": "YT",
    "ab": "AB", "bc": "BC", "mb": "MB", "nb": "NB", "nl": "NL",
    "nt": "NT", "ns": "NS", "nu": "NU", "on": "ON", "pe": "PE",
    "qc": "QC", "sk": "SK", "yt": "YT"
}


def normalize_company_name(name):
    if not name:
        return ""
    return re.sub(r'\s+', ' ', name.strip().upper())


def strip_company_suffix(name):
    if not name:
        return ""
    stripped = name.upper()
    for suffix_pattern in COMPANY_SUFFIXES:
        stripped = re.sub(suffix_pattern, '', stripped, flags=re.IGNORECASE)
    stripped = re.sub(r'[,.\-]+', '', stripped.strip())
    return re.sub(r'\s+', ' ', stripped).strip()


def normalize_province(province):
    if not province:
        return ""
    return PROVINCE_ABBREVS.get(province.strip().lower(),
                                 province.strip().upper())


def normalize_postal_code(postal_code):
    if not postal_code:
        return ""
    cleaned = re.sub(r'[^A-Za-z0-9]', '', postal_code).upper()
    if len(cleaned) == 6:
        return f"{cleaned[:3]} {cleaned[3:]}"
    return postal_code.strip().upper()


def make_dedup_key(company):
    name = strip_company_suffix(company.get("cid_company_name", ""))
    province = normalize_province(company.get("cid_province", ""))
    city = company.get("cid_city", "").strip().upper()
    return f"{name}|{province}|{city}"


def deduplicate_companies(companies):
    seen = {}
    for company in companies:
        key = make_dedup_key(company)
        if key not in seen:
            seen[key] = company
        else:
            existing_fields = sum(1 for v in seen[key].values() if v)
            new_fields = sum(1 for v in company.values() if v)
            if new_fields > existing_fields:
                seen[key] = company
    deduped = list(seen.values())
    logger.info(f"Deduplication: {len(companies)} -> {len(deduped)} companies")
    return deduped


def normalize_companies(companies):
    for company in companies:
        company["cid_company_name"] = normalize_company_name(
            company.get("cid_company_name", ""))
        company["cid_province"] = normalize_province(
            company.get("cid_province", ""))
        company["cid_postal_code"] = normalize_postal_code(
            company.get("cid_postal_code", ""))
        company["cid_city"] = company.get("cid_city", "").strip().title()
    return deduplicate_companies(companies)
