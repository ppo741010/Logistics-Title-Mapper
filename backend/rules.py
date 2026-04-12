"""
Classification data and core rule engine —
ported directly from src/App.jsx
"""

import re

# ── Classification data ──────────────────────────────────────────────────────

PRIORITY_DOMAIN_RULES = {
    "Warehouse": [
        "warehouse manager","warehouse supervisor","warehouse coordinator",
        "warehouse assistant","warehouse","storeperson","store person","forklift",
        "picker","packer","pick pack","inventory","stock","distribution centre",
        "distribution center","devanner","labourer","fulfilment","fulfillment",
        "fulfilment manager","fulfillment manager","inbound","outbound","returns",
        "cold storage","receiving","despatch","put away",
    ],
    "Transport": [
        "transport manager","dispatch coordinator","dispatcher","dispatch",
        "allocator","delivery","driver","courier","linehaul","fleet","route",
    ],
    "Freight Forwarding": [
        "freight","customs","brokerage","import","export",
        "airfreight","seafreight","forwarding",
    ],
    "Planning": [
        "supply chain","demand planner","planner","planning","procurement",
        "purchasing","purchaser","buyer","business analyst","scheduler",
        "sourcing","replenishment","forecast",
    ],
    "Finance": [
        "accounts payable","accounts receivable","accountant","accounts",
        "payroll","finance","billing","costing","fp&a","financial planning",
        "financial analyst","treasury","budgeting",
    ],
    "IT Support": [
        "developer","architect","systems","technology","application support",
        "technical support","it support","software support","application specialist",
        "hris specialist","technical consultant",
    ],
    "Operations": [
        "operations manager","operations supervisor","operations coordinator",
        "logistics manager","logistics coordinator","logistics","operator",
        "controller","process","production","quality","qa","sap","decon",
        "consol","erp","e-commerce","ecommerce","omnichannel",
    ],
    "Business Administration": [
        "office administrator","admin assistant","executive assistant",
        "personal assistant","receptionist","office support","clerical",
        "office manager","hr business partner","hr advisor","hr coordinator",
        "hr transformation","hr specialist",
    ],
    "Sales": [
        "customer service","customer support","sales operations","sales coordinator",
        "sales manager","sales","business development","key account","merchandiser",
        "representative","account manager","commercial","commercial manager",
        "commercial development","business to business","b2b","b2c","activation","channel",
    ],
}

FUZZY_ROLE_REPAIR = {
    "checkout/retail": "Other/Noise", "retail": "Other/Noise",
    "cleaning": "Other/Noise", "electrician": "Other/Noise",
    "surveyor": "Other/Noise", "agronomist": "Other/Noise",
    "cleaner": "Other/Noise", "estimator": "Other/Noise",
    "powerline": "Other/Noise", "kiwifruit": "Other/Noise",
    "faller": "Other/Noise", "health consultant": "Other/Noise",
    "office administrator": "Business Administration",
    "hr business partner": "Business Administration",
    "admin assistant": "Business Administration",
    "executive assistant": "Business Administration",
    "receptionist": "Business Administration",
    "analytics": "Planning", "category manager": "Planning",
    "supply manager": "Planning", "materials manager": "Planning",
    "freight": "Freight Forwarding",
    "dispatch coordinator": "Transport", "allocator": "Transport", "driver": "Transport",
    "warehouse manager": "Warehouse", "inventory": "Warehouse", "forklift": "Warehouse",
    "accounts payable": "Finance", "accountant": "Finance", "payroll": "Finance",
    "developer": "IT Support", "implementation": "IT Support",
    "solutions consultant": "IT Support",
    "operations manager": "Operations", "logistics": "Operations",
    "customer service": "Sales", "sales": "Sales",
    "business development": "Sales", "head of retail": "Sales",
    "commercial manager": "Sales",
}

LEVEL_MAPPING = {
    "ceo": "5. Executive / Strategic", "gm": "5. Executive / Strategic",
    "director": "5. Executive / Strategic", "head of": "5. Executive / Strategic",
    "executive": "5. Executive / Strategic",
    "manager": "4. Expert / Specialist",
    "consultant": "4. Expert / Specialist", "analyst": "4. Expert / Specialist",
    "strategist": "4. Expert / Specialist",
    "specialist": "3. Senior / Professional",
    "senior": "3. Senior / Professional", "team lead": "3. Senior / Professional",
    "principal": "3. Senior / Professional", "advanced": "3. Senior / Professional",
    "coordinator": "2. Intermediate / Staff", "supervisor": "2. Intermediate / Staff",
    "officer": "2. Intermediate / Staff", "administrator": "2. Intermediate / Staff",
    "representative": "2. Intermediate / Staff", "operator": "2. Intermediate / Staff",
    "driver": "2. Intermediate / Staff", "planner": "2. Intermediate / Staff",
    "junior": "1. Junior / Entry", "graduate": "1. Junior / Entry",
    "trainee": "1. Junior / Entry", "entry": "1. Junior / Entry",
    "assistant": "1. Junior / Entry", "picker": "1. Junior / Entry",
    "packer": "1. Junior / Entry", "handler": "1. Junior / Entry",
}

WORK_NATURE_MAPPING = {
    "Management": [
        "manager","director","head","gm","chief","executive",
        "superintendent","principal",
    ],
    "Specialist / Support": [
        "analyst","planner","consultant","engineer","accountant","specialist",
        "officer","admin","administrator","representative","agent","support",
        "architect","business development","customer service","merchandiser",
        "key account","sales","advisor","accounts","finance","billing","payroll",
    ],
    "Operational": [
        "coordinator","supervisor","operator","driver","picker","storeman",
        "clerk","handler","assistant","staff","loader","sorter","packer",
        "dispatch","storeperson","controller","tally","devanner","mechanic",
    ],
}

DOMAIN_SKILL_FIXED = {
    "Business Administration": ["Leadership","Stakeholder Management","Strategic Planning","KPI Management"],
    "Operations":              ["Process Optimization","Operational Excellence","Resource Allocation","SOP Development"],
    "Finance":                 ["Cost Analysis","Accounts Payable/Receivable","ERP Proficiency","Financial Reporting"],
    "Planning":                ["Demand Forecasting","Inventory Optimization","Supply Chain Planning","S&OP"],
    "Freight Forwarding":      ["Incoterms","Customs Clearance","Export/Import Documentation","Consolidation"],
    "Warehouse":               ["Inventory Accuracy","WMS","RF Scanning","Manual Handling","Safety Compliance"],
    "Transport":               ["TMS","Route Optimization","Fleet Management","Last Mile Delivery","Compliance"],
    "Sales":                   ["CRM","Quotation","Market Analysis","Revenue Growth","Customer Service"],
    "IT Support":              ["Systems Integration","ERP Maintenance","Data Governance","IT Infrastructure"],
    "Other/Noise":             [],
}

SKILL_SYNONYMS = {
    "erp": "ERP Systems", "sap/erp": "ERP Systems", "erp software": "ERP Systems",
    "wms": "WMS", "warehouse management system": "WMS", "wms software": "WMS",
    "tms": "TMS", "transport management system": "TMS", "tms software": "TMS",
    "crm": "CRM", "customer relationship management": "CRM", "crm software": "CRM",
    "ms excel": "Microsoft Excel", "microsoft excel": "Microsoft Excel",
    "advanced excel": "Microsoft Excel (Advanced)",
    "forklift operation": "Forklift Operation", "sql": "SQL",
    "data governance": "Data Governance",
    "supply chain management": "Supply Chain Management",
    "inventory control": "Inventory Control",
    "inventory management": "Inventory Management",
    "rf scanning": "RF Scanning", "sap": "SAP", "s&op": "S&OP",
    "kpi": "KPI", "kpi management": "KPI Management",
    "mrp": "MRP", "sop": "SOP", "edi": "EDI", "vmi": "VMI",
    "ohs": "OHS", "ehs": "EHS", "sla": "SLA",
    "power bi": "Power BI", "powerbi": "Power BI", "power-bi": "Power BI",
    "tableau": "Tableau",
    "python": "Python", "python scripting": "Python",
    "cold chain": "Cold Chain", "cold storage": "Cold Chain",
    "temperature controlled": "Cold Chain",
    "last mile": "Last Mile Delivery", "last mile delivery": "Last Mile Delivery",
    "last-mile": "Last Mile Delivery",
    "cross docking": "Cross-Docking", "cross-docking": "Cross-Docking",
    "cross dock": "Cross-Docking",
    "pick and pack": "Pick & Pack", "pick & pack": "Pick & Pack", "pick pack": "Pick & Pack",
    "3pl management": "3PL Management", "third party logistics": "3PL Management",
    "3pl": "3PL Management",
    "dangerous goods": "Dangerous Goods", "dg": "Dangerous Goods",
    "hazmat": "Dangerous Goods", "hazchem": "Dangerous Goods",
    "haccp": "HACCP", "food safety": "HACCP",
    "iso 9001": "ISO 9001", "iso9001": "ISO 9001",
    "customs compliance": "Customs Compliance",
    "customs regulations": "Customs Compliance",
    "tender management": "Tender Management", "rfq": "Tender Management",
    "request for quotation": "Tender Management",
    "vendor management": "Vendor Management",
    "supplier management": "Vendor Management",
    "supplier relations": "Vendor Management",
    "contract negotiation": "Contract Negotiation",
    "contract management": "Contract Negotiation",
    "stakeholder management": "Stakeholder Management",
    "stakeholder engagement": "Stakeholder Management",
    "team leadership": "Team Leadership", "people management": "Team Leadership",
    "leading teams": "Team Leadership",
    "communication": "Communication Skills",
    "written communication": "Communication Skills",
    "verbal communication": "Communication Skills",
    "continuous improvement": "Continuous Improvement",
    "lean": "Lean Methodology",
    "lean six sigma": "Lean Six Sigma", "six sigma": "Lean Six Sigma",
}

REMOVE_PHRASES = [
    "immediate start","apply now","great opportunity","exciting opportunity",
    "career growth","wanted","needed","join our team","above award rate",
    "great money","packag","distrib","remuner","salary package",
    "competitive package","competitive salary",
]
REMOVE_SHIFT = [
    "night shift","day shift","afternoon shift","am shift","pm shift",
    "overnight","morning shift","part time","full time","casual",
]
REMOVE_CONTRACT = [
    "ftc","fixed term","fixed-term","contract role","contract position",
    "temp role","temporary role","temp to perm","maternity cover",
    "parental leave cover","secondment","ongoing","permanent role","casual role",
]

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

# ── Compiled regex patterns ──────────────────────────────────────────────────

_SALARY_RE = re.compile(
    r'\$[\d,]+[k]?(?:\s*[-–]\s*\$?[\d,]+[k]?)?\s*'
    r'(?:pa|p\.a\.|per annum|per year|annually|ph|p\.h\.|per hour)?',
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
_EMOJI_RE = re.compile(
    r'[\U0001F300-\U0001FAFF]|[\u2600-\u27BF]|[\uFE00-\uFE0F]'
)
_MULTI_SEP_RE   = re.compile(r'(\s*[-–]\s*){2,}')
_TRAILING_RE    = re.compile(r'[-–,|&]+$')
_TITLE_CASE_RE  = re.compile(r'\b\w')


def _title_case(s: str) -> str:
    return _TITLE_CASE_RE.sub(lambda m: m.group().upper(), s)


# ── Core logic ───────────────────────────────────────────────────────────────

def clean_title(raw: str) -> str:
    t = raw.strip()
    # Strip emoji
    t = _EMOJI_RE.sub("", t).strip()
    # Normalize ALL-CAPS
    letters = re.sub(r'[^a-zA-Z]', '', t)
    if letters and sum(1 for c in letters if c.isupper()) / len(letters) > 0.7:
        t = t.lower()
    # Remove noise phrases and shift patterns
    for phrase in REMOVE_PHRASES + REMOVE_SHIFT:
        t = re.sub(rf'\b{re.escape(phrase)}\b', '', t, flags=re.IGNORECASE)
    # Fix typos
    for typo, fix in TYPO_MAP.items():
        t = re.sub(re.escape(typo), fix, t, flags=re.IGNORECASE)
    # Remove salary, contract duration, hours/positions
    t = _SALARY_RE.sub('', t)
    t = _CONTRACT_DURATION_RE.sub('', t)
    t = _HOURS_POSITIONS_RE.sub('', t)
    # Remove contract type keywords
    for phrase in REMOVE_CONTRACT:
        t = re.sub(rf'\b{re.escape(phrase)}\b', '', t, flags=re.IGNORECASE)
    # Remove bracketed content first (before location strip eats the closing bracket)
    t = re.sub(r'\(.*?\)', '', t)
    t = re.sub(r'\[.*?\]', '', t)
    # Strip location suffix
    t = _LOCATION_RE.sub('', t)
    # Expand abbreviations
    abbrevs = [
        (r'\bSr\.(?=\s|$)',  'Senior'), (r'\bJr\.(?=\s|$)',  'Junior'),
        (r'\bMgr\.?(?=\s|$)', 'Manager'), (r'\bCoord\.?(?=\s|$)', 'Coordinator'),
        (r'\bAsst\.?(?=\s|$)', 'Assistant'), (r'\bSupvr?\.?(?=\s|$)', 'Supervisor'),
        (r'\bDir\.?(?=\s|$)', 'Director'), (r'\bExec\.?(?=\s|$)', 'Executive'),
        (r'\bBD\b', 'Business Development'), (r'\bOps\b', 'Operations'),
        (r'\bGM\b', 'General Manager'), (r'\bVP\b', 'Vice President'),
        (r'\bSVP\b', 'Senior Vice President'), (r'\bEVP\b', 'Executive Vice President'),
        (r'\bCOO\b', 'Chief Operations Officer'), (r'\bCFO\b', 'Chief Financial Officer'),
        (r'\bCTO\b', 'Chief Technology Officer'),
        (r'\bDC\b', 'Distribution Centre'),
        (r"\bInt['']?l\b", 'International'), (r'\bNatl\b', 'National'),
        (r'\bTL\b', 'Team Lead'),
        (r'\bFP&A\b', 'Financial Planning & Analysis'),
        (r'\bB2B\b', 'Business to Business'), (r'\bB2C\b', 'Business to Consumer'),
    ]
    for pattern, replacement in abbrevs:
        t = re.sub(pattern, replacement, t, flags=re.IGNORECASE)
    # Collapse multiple separators and clean trailing chars
    t = _MULTI_SEP_RE.sub(' - ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = _TRAILING_RE.sub('', t).strip()
    return _title_case(t)


def classify(title: str, description: str = '') -> dict:
    tl = title.lower()
    dl = description.lower()

    # Score every domain against title keywords
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

    # Fuzzy repair fallback
    for key, domain in FUZZY_ROLE_REPAIR.items():
        if key in tl:
            if domain == "Other/Noise":
                return {
                    "domain": domain, "confidence": 30, "source": "fuzzy",
                    "matched_keywords": [key],
                    "noise_reason": "fuzzy_noise", "noise_keyword": key,
                }
            return {"domain": domain, "confidence": 74, "source": "fuzzy", "matched_keywords": [key]}

    # Description fallback
    if description:
        desc_scores: dict[str, int] = {}
        for domain, kws in PRIORITY_DOMAIN_RULES.items():
            for kw in kws:
                if kw in dl:
                    desc_scores[domain] = desc_scores.get(domain, 0) + (len(kw.split()) if ' ' in kw else 1)
        if desc_scores:
            best = max(desc_scores.items(), key=lambda x: x[1])
            score = best[1]
            confidence = 72 if score >= 4 else 65 if score >= 2 else 58
            return {"domain": best[0], "confidence": confidence, "source": "description", "matched_keywords": []}

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
    domain     = result["domain"]
    confidence = result["confidence"]
    source     = result["source"]
    matched_kw = result.get("matched_keywords", [])
    noise_reason  = result.get("noise_reason")
    noise_keyword = result.get("noise_keyword")

    seniority   = "Review Required" if domain == "Other/Noise" else get_seniority(raw_title)
    work_nature = "Review Required" if domain == "Other/Noise" else get_work_nature(raw_title)
    skills      = get_skills(domain, description)

    flags = []
    if domain == "Other/Noise":
        flags.append("Title does not match a known logistics domain — verify before use")
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
        "country":          country,
    }
