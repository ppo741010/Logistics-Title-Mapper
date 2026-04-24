"""
Classification engine — logistics-title-mapper
Data loaded from json/ (source of truth: seek-pipeline/json/)
Classification flow:
  Step 1 — PRIORITY_DOMAIN_RULES keyword match (title)
  Step 2 — FUZZY_ROLE_REPAIR fuzzy match (title)
  Step 3 — PRIORITY_DOMAIN_RULES keyword match (description)
  Step 4 — Claude Haiku AI fallback (only when Steps 1-3 all fail)
Skills/level enrichment: skills_knowledge_map exact lookup → DOMAIN_SKILL_FIXED fallback
"""

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

_BASE = Path(__file__).parent
load_dotenv(_BASE / ".env")

# ── Load JSON config files ───────────────────────────────────────────────────

def _load(filename: str) -> dict:
    return json.loads((_BASE / "json" / filename).read_text(encoding="utf-8"))

_cfg        = _load("logistics_config.json")
_normalize  = _load("skill_normalize.json")
_skills_map = _load("skills_knowledge_map.json")

# ── Classification data (from logistics_config.json) ─────────────────────────

PRIORITY_DOMAIN_RULES: dict[str, list[str]] = _cfg["PRIORITY_DOMAIN_RULES"]
FUZZY_ROLE_REPAIR:     dict[str, str]        = _cfg["FUZZY_ROLE_REPAIR"]
DOMAIN_SKILL_FIXED:    dict[str, list[str]]  = _cfg["DOMAIN_SKILL_FIXED"]
WORK_NATURE_MAPPING:   dict[str, list[str]]  = _cfg["WORK_NATURE_MAPPING"]

# JSON keys are Title Case → lowercase for matching
LEVEL_MAPPING: dict[str, str] = {
    k.lower(): v for k, v in _cfg["LEVEL_MAPPING"].items()
}

# ── Skill normalisation (from skill_normalize.json) ──────────────────────────

SKILL_SYNONYMS: dict[str, str] = _normalize["skill_synonyms"]
_ABBREV_SET:    set[str]        = set(_normalize["abbreviations"])
_JUNK_VALUES:   set[str]        = set(_normalize["junk_values"] + _normalize["soft_skills"])

# ── Exact title lookup (from skills_knowledge_map.json) ──────────────────────

_SKILLS_KNOWLEDGE_MAP: dict[str, dict] = {
    k.lower(): v
    for k, v in _skills_map.items()
    if not k.startswith("_")
}

# Map skills_knowledge_map level values → UI display strings
_LEVEL_DISPLAY = {
    "Entry":      "1. Junior / Entry",
    "Mid":        "2. Intermediate / Staff",
    "Senior":     "3. Senior / Professional",
    "Management": "4. Expert / Specialist",
    "Executive":  "5. Executive / Strategic",
}

# ── Hardcoded rules (logistics-title-mapper specific, not in JSON) ────────────

TYPO_MAP = {
    "assisstant": "assistant", "coodrinator": "coordinator", "sepcialist": "specialist",
    "mandarine": "mandarin", "operatior": "operator", "oprations": "operations",
    "mananger": "manager", "manageer": "manager", "manger": "manager",
    "logsitics": "logistics", "logistic ": "logistics ", "logsitic": "logistics",
    "warehuse": "warehouse", "warehose": "warehouse", "wherehouse": "warehouse",
    "suprevisor": "supervisor", "supervisior": "supervisor", "supervsior": "supervisor",
    "freigth": "freight", "frieght": "freight",
    "tranport": "transport", "transprot": "transport",
    "recieving": "receiving", "reciving": "receiving",
    "planiner": "planner", "plannner": "planner",
    "accouns": "accounts", "acocunts": "accounts",
    "purchassing": "purchasing", "purchacing": "purchasing",
    "cusotmer": "customer", "custumer": "customer",
}

CROSS_FUNCTIONAL_PAIRS = [
    ("warehouse", "dispatch",
     "Cross-functional signal: Warehouse + Dispatch — may span multiple domains"),
    ("customer service", "logistics",
     "Cross-functional signal: Customer Service + Logistics — role scope may be broad"),
    ("transport", "warehouse",
     "Cross-functional signal: Transport + Warehouse — dual-function role detected"),
    ("freight", "customer",
     "Cross-functional signal: Freight + Customer-facing — may span Freight Forwarding and Sales"),
    ("customer service", "dispatch",
     "Cross-functional signal: Customer Service + Dispatch — may bridge Sales and Transport"),
]

REMOVE_PHRASES = [
    "immediate start", "apply now", "great opportunity", "exciting opportunity",
    "career growth", "wanted", "needed", "join our team", "above award rate",
    "great money", "packag", "distrib", "remuner", "salary package",
    "competitive package", "competitive salary", "bonus",
]
REMOVE_SHIFT = [
    "night shift", "day shift", "afternoon shift", "am shift", "pm shift",
    "overnight", "morning shift", "part time", "full time", "casual",
]
REMOVE_CONTRACT = [
    "ftc", "fixed term", "fixed-term", "contract role", "contract position",
    "temp role", "temporary role", "temp to perm", "maternity cover",
    "parental leave cover", "secondment", "ongoing", "permanent role", "casual role",
]

# ── Compiled regex patterns ──────────────────────────────────────────────────

_SALARY_RE = re.compile(
    r'\$[\d,]+[k]?(?:\s*[-–]\s*\$?[\d,]+[k]?)?\s*'
    r'(?:pa\b|p\.a\.|per annum|per year|annually|ph\b|p\.h\.|per hour)?',
    re.IGNORECASE,
)
_CONTRACT_DURATION_RE = re.compile(
    r'\b\d+[-\s]?(?:month|week|year)s?\b(?:\s*contract)?',
    re.IGNORECASE,
)
_HOURS_POSITIONS_RE = re.compile(
    r'\b(?:\d+\.?\d*\s*h(?:rs?|ours?)(?:\s*p\.?w\.?|\s*per\s*week)?'
    r'|\d+\s*x\s*\w+'
    r'|x\s*\d+\s*(?:position|role|vacancy|vacancies)?s?'
    r'|\d+\s*(?:position|role|vacancy|vacancies)s?'
    r'|multiple\s*(?:position|role)s?)\b',
    re.IGNORECASE,
)
_LOCATION_RE = re.compile(
    r'[-–|,]\s*(?:NZ|AU|NZL|AUS|NZ/AU|AU/NZ|Auckland|Wellington|Christchurch'
    r'|Hamilton|Dunedin|Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra'
    r'|Singapore|SGP|London|Manchester|Birmingham|UK|United Kingdom'
    r'|New York|Los Angeles|Chicago|Houston|US|USA|United States'
    r'|APAC|ANZ|Remote|Hybrid|On-?site).*',
    re.IGNORECASE,
)
_EMOJI_RE       = re.compile(r'[\U0001F300-\U0001FAFF]|[☀-➿]|[︀-️]')
_MULTI_SEP_RE   = re.compile(r'(\s*[-–]\s*){2,}')
_TRAILING_RE    = re.compile(r'[-–,|&]+$')
_TITLE_CASE_RE  = re.compile(r'\b\w')

# ── AI fallback (Claude Haiku) ───────────────────────────────────────────────

_AI_SYSTEM_PROMPT = """You are a logistics job title domain classifier for the NZ/AU market.

Classify the job title into exactly ONE domain:
Warehouse, Transport, Freight Forwarding, Planning, Operations,
Finance, Sales, IT Support, Business Administration, Other/Noise

Rules:
- Warehouse: physical execution inside a DC/warehouse (forklift, picker, storeperson, DC supervisor)
- Transport: movement of goods outside the facility (driver, fleet, courier, linehaul, allocator)
- Freight Forwarding: cross-border, customs, import/export (customs broker, freight forwarder)
- Planning: forward-looking demand/supply/procurement (demand planner, buyer, S&OP, scheduler)
- Operations: cross-functional coordination and execution management (operations manager, logistics coordinator)
- Finance: financial control and reporting (accountant, payroll, AP/AR, financial analyst)
- Sales: revenue-generating and customer-facing (sales rep, account manager, customer service at logistics firm)
- IT Support: systems and technology roles (ERP/WMS/TMS consultant, developer, systems analyst)
- Business Administration: internal enabling functions (HR, receptionist, admin officer)
- Other/Noise: no logistics/supply chain connection

Return ONLY valid JSON, no markdown:
{"domain": "Warehouse", "confidence": 72, "reason": "one line"}"""

_VALID_DOMAINS = {
    "Warehouse", "Transport", "Freight Forwarding", "Planning", "Operations",
    "Finance", "Sales", "IT Support", "Business Administration", "Other/Noise",
}

def _ai_classify(title: str, description: str = '') -> dict | None:
    """Claude Haiku fallback — only called when rule engine returns unmatched Other/Noise."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        user_msg = f"Job title: {title}"
        if description:
            user_msg += f"\nContext: {description[:200]}"

        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=120,
            system=_AI_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:]).rsplit("```", 1)[0].strip()

        parsed = json.loads(text)
        domain = parsed.get("domain", "Other/Noise")
        if domain not in _VALID_DOMAINS:
            domain = "Other/Noise"
        return {
            "domain":           domain,
            "confidence":       min(int(parsed.get("confidence", 55)), 70),
            "source":           "ai",
            "matched_keywords": [],
            "ai_reason":        parsed.get("reason", ""),
        }
    except Exception:
        return None

# ── Helper: skills_knowledge_map lookup ─────────────────────────────────────

def _map_lookup(title: str) -> dict | None:
    """Exact (case-insensitive) lookup in skills_knowledge_map."""
    return _SKILLS_KNOWLEDGE_MAP.get(title.lower().strip())

# ── Core functions ───────────────────────────────────────────────────────────

def _title_case(s: str) -> str:
    return _TITLE_CASE_RE.sub(lambda m: m.group().upper(), s)


def clean_title(raw: str) -> str:
    t = str(raw).strip()
    t = _EMOJI_RE.sub("", t)
    t = _SALARY_RE.sub("", t)
    t = _CONTRACT_DURATION_RE.sub("", t)
    t = _HOURS_POSITIONS_RE.sub("", t)
    t = _LOCATION_RE.sub("", t)
    tl = t.lower()
    for phrase in REMOVE_PHRASES + REMOVE_SHIFT + REMOVE_CONTRACT:
        tl = tl.replace(phrase, "")
    for typo, fix in TYPO_MAP.items():
        tl = tl.replace(typo, fix)
    t = _MULTI_SEP_RE.sub(" – ", tl)
    t = _TRAILING_RE.sub("", t).strip()
    t = re.sub(r'\s+', ' ', t).strip()
    return _title_case(t) if t else raw.strip()


def classify(title: str, description: str = '') -> dict:
    tl = title.lower()
    dl = description.lower()

    # Step 1 — keyword match on title
    domain_scores: dict[str, int] = {}
    domain_matches: dict[str, list[str]] = {}
    for domain, kws in PRIORITY_DOMAIN_RULES.items():
        score = 0
        matched = []
        for kw in kws:
            if kw in tl:
                weight = len(kw.split()) if ' ' in kw else 1
                score += weight
                matched.append(kw)
        if score > 0:
            domain_scores[domain] = score
            domain_matches[domain] = matched

    if domain_scores:
        sorted_domains = sorted(domain_scores.items(), key=lambda x: -x[1])
        best_domain, best_score = sorted_domains[0]
        second_score = sorted_domains[1][1] if len(sorted_domains) > 1 else 0
        margin = best_score - second_score
        if best_score >= 4 and margin >= 2:
            confidence = 92
        elif best_score >= 3 and margin >= 2:
            confidence = 88
        elif best_score >= 2 and margin >= 1:
            confidence = 80
        elif margin >= 1:
            confidence = 72
        else:
            confidence = 62
        return {
            "domain": best_domain, "confidence": confidence,
            "source": "title", "matched_keywords": domain_matches[best_domain],
        }

    # Step 2 — FUZZY_ROLE_REPAIR fallback
    for key, domain in FUZZY_ROLE_REPAIR.items():
        if key in tl:
            if domain == "Other/Noise":
                return {
                    "domain": domain, "confidence": 30, "source": "fuzzy",
                    "matched_keywords": [key],
                    "noise_reason": "fuzzy_noise", "noise_keyword": key,
                }
            return {
                "domain": domain, "confidence": 74,
                "source": "fuzzy", "matched_keywords": [key],
            }

    # Step 3 — keyword match on description
    if description:
        desc_scores: dict[str, int] = {}
        for domain, kws in PRIORITY_DOMAIN_RULES.items():
            for kw in kws:
                if kw in dl:
                    desc_scores[domain] = desc_scores.get(domain, 0) + (
                        len(kw.split()) if ' ' in kw else 1
                    )
        if desc_scores:
            best = max(desc_scores.items(), key=lambda x: x[1])
            score = best[1]
            confidence = 72 if score >= 4 else 65 if score >= 2 else 58
            return {
                "domain": best[0], "confidence": confidence,
                "source": "description", "matched_keywords": [],
            }

    # All rule-based steps failed
    return {
        "domain": "Other/Noise", "confidence": 30,
        "source": "unmatched", "matched_keywords": [],
        "noise_reason": "no_match",
    }


def get_seniority(title: str) -> str:
    tl = title.lower()
    for key, label in LEVEL_MAPPING.items():
        if key in tl:
            return label
    return "2. Intermediate / Staff"


def get_work_nature(title: str) -> str:
    tl = title.lower()
    for nature, kws in WORK_NATURE_MAPPING.items():
        for kw in kws:
            if kw in tl:
                return nature
    return "Operational"


def get_skills(domain: str, description: str) -> list[str]:
    base = list(DOMAIN_SKILL_FIXED.get(domain, []))
    dl = description.lower()
    extra = []
    for raw, norm in SKILL_SYNONYMS.items():
        if raw in dl and norm not in base and norm not in extra:
            extra.append(norm)
    return (base + extra)[:6]


def analyze(raw_title: str, description: str = '', country: str = '') -> dict:
    clean = clean_title(raw_title)
    result = classify(raw_title, description)

    # Step 4 — AI fallback for truly unmatched titles
    ai_used = False
    if result["source"] == "unmatched":
        ai_result = _ai_classify(raw_title, description)
        if ai_result and ai_result["domain"] != "Other/Noise":
            result = ai_result
            ai_used = True

    domain    = result["domain"]
    confidence = result["confidence"]
    source    = result["source"]
    matched_kw = result.get("matched_keywords", [])
    noise_reason  = result.get("noise_reason")
    noise_keyword = result.get("noise_keyword")
    ai_reason     = result.get("ai_reason")

    # Skills + level: try exact map lookup first, then fallback
    map_entry = _map_lookup(raw_title) or _map_lookup(clean)
    if map_entry and domain != "Other/Noise":
        skills   = [s.strip() for s in map_entry["skills"].split(",") if s.strip()][:6]
        seniority = _LEVEL_DISPLAY.get(map_entry["level"], get_seniority(raw_title))
    else:
        skills    = get_skills(domain, description)
        seniority = "Review Required" if domain == "Other/Noise" else get_seniority(raw_title)

    work_nature = "Review Required" if domain == "Other/Noise" else get_work_nature(raw_title)

    # Flags
    flags = []
    if domain == "Other/Noise":
        flags.append("Title does not match a known logistics domain — verify before use")
    if ai_used:
        flags.append("Domain inferred by AI — rule-based match not found")
    if source == "description":
        flags.append("Domain inferred from description only — title keyword was ambiguous")
    if not country:
        flags.append("Country not provided — seniority inference may be less accurate")
    if len(description) < 30:
        flags.append("Description is short — output is based mainly on title text")
    if len(raw_title) > 60:
        flags.append("Title is long — may contain location, shift, or contract noise")

    combined = (raw_title + " " + description).lower()
    for a, b, flag in CROSS_FUNCTIONAL_PAIRS:
        if a in combined and b in combined:
            flags.append(flag)

    has_cross_flag = any(a in combined and b in combined for a, b, _ in CROSS_FUNCTIONAL_PAIRS)
    needs_review   = domain == "Other/Noise" or confidence < 70 or has_cross_flag

    return {
        "raw_title":        raw_title,
        "clean_title":      clean,
        "domain":           domain,
        "work_nature":      work_nature,
        "seniority":        seniority,
        "skills":           skills,
        "confidence":       confidence,
        "matched_keywords": matched_kw,
        "flags":            flags,
        "has_cross_flag":   has_cross_flag,
        "needs_review":     needs_review,
        "noise_reason":     noise_reason,
        "noise_keyword":    noise_keyword,
        "ai_used":          ai_used,
        "ai_reason":        ai_reason,
        "country":          country,
    }
