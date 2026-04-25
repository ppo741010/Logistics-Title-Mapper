# Logistics Title Mapper

A browser-based tool for cleaning, classifying, and normalizing logistics job titles — built for recruiters, HR teams, and workforce analysts who work with messy job ad data.

**Live:** https://logistics-title-mapper.vercel.app/

---

## The Problem

Job title data collected from job boards, spreadsheets, or applicant tracking systems is often inconsistent and hard to work with:

- The same role appears under dozens of different names (`Sr. Ops Mgr`, `Senior Operations Manager`, `ops manager - Auckland $85k FTC`)
- Titles contain noise — salary ranges, locations, shift types, contract durations — that makes grouping and analysis difficult
- There is no standard taxonomy, so comparing roles across datasets or time periods requires manual cleanup

Doing this by hand is slow and error-prone. Logistics Title Mapper automates the most repetitive parts.

---

## What It Does

### 1. Single Analyzer
Paste a raw job title and get an instant structured output:
- **Clean Title** — noise removed, abbreviations expanded, known acronyms preserved (HSE, WMS, FP&A, etc.)
- **Functional Area** — which logistics domain the role belongs to (9 domains)
- **Seniority Level** — Entry Level · Mid Level · Senior · Manager · Executive
- **Work Nature** — Management, Specialist/Support, or Operational
- **Normalized Skills** — canonical skill tags matched from title and description
- **Confidence Score** — 0–100 with matched keywords shown
- **Review Flags** — highlights ambiguous, short, or out-of-scope inputs
- **Salary Benchmark** — market reference range for NZ and AU roles (select country to activate)

Optionally provide a **job description** to improve classification accuracy, and a **country** (NZ/AU) to show salary benchmarks.

### 2. Bulk Upload
Upload a CSV or XLSX file (up to 10,000 rows) and process everything at once:
- **Multi-sheet XLSX support** — select which sheet to import when a workbook has multiple sheets
- Auto-detect or manually map column names (title, description, country)
- **Clean Preview** — review before/after cleaning for every title; edit any clean title manually before classification runs
- Download structured output as CSV, JSON, or Excel
- Export includes `salary_range` and `salary_median` columns when country is provided

### 3. Skill Mapper
Paste raw skill phrases from job descriptions and normalize them to standard canonical labels:
- `warehouse management system` → `WMS`
- `advanced excel` → `Microsoft Excel (Advanced)`
- `generative ai`, `chatgpt` → `Generative AI`
- `rpa`, `robotic process automation` → `RPA`
- Covers logistics systems, AI tools, Microsoft/Google Office, accounting software (Xero, MYOB), project management tools, HR systems, and soft skills
- Skill data loaded from `skill_normalize.json` — single source of truth shared with the backend

### 4. Title Cleaner
See exactly how titles are transformed — useful for understanding the cleaning rules before running a bulk job:
- Removes salary ranges, locations, shift patterns, contract types, noise phrases
- Expands abbreviations (`Sr.` → `Senior`, `Ops Mgr` → `Operations Manager`)
- Preserves known acronyms in uppercase (HSE, WMS, SAP, HR, IT, KPI, etc.)

### 5. Export
Configure and download structured output with selectable fields:
- Choose which fields to include (raw title, clean title, domain, seniority, skills, salary, flags, etc.)
- Export as CSV, JSON, or XLSX
- Works with Bulk Upload results or demo data

---

## Functional Areas

Roles are classified into 9 domains:

| Domain | Example Roles |
|--------|--------------|
| Warehouse | Warehouse Manager, Forklift Operator, Inventory Controller |
| Transport | Dispatch Coordinator, Fleet Manager, Driver |
| Freight Forwarding | Customs Broker, Import/Export Officer, Freight Coordinator |
| Planning | Demand Planner, Supply Chain Analyst, Procurement Manager |
| Operations | Operations Manager, HSE Manager, Logistics Coordinator |
| Finance | Accounts Payable, FP&A Manager, Payroll Officer |
| Sales | Account Manager, Business Development, Digital Marketing Manager |
| IT Support | Systems Analyst, SAP Functional Consultant, IT Support Officer |
| Business Administration | EA, HR Coordinator, Office Manager |

---

## How Classification Works

Classification follows a **four-stage pipeline**:

1. **Keyword match on title** — scores title against 9 domain keyword lists (288+ keywords); multi-word keywords weighted higher. Confidence 72–92%.
2. **Fuzzy repair rules** — substring fallback for abbreviated or ambiguous titles (165+ entries). Confidence 74% (30% if noise).
3. **Description keyword match** — used when title alone is insufficient. Confidence 58–72%.
4. **AI fallback (Claude Haiku)** — called for titles that pass all three rule stages without a match. Capped at 70% confidence.

All outputs are **suggested draft classifications** intended for normalization and review support, not final authoritative labels.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, deployed on Vercel |
| Backend | Python FastAPI, deployed on Render |
| Classification | Rule-based engine + Claude Haiku AI fallback |
| Skill data | `skill_normalize.json` (shared frontend/backend) |
| Config | `logistics_config.json` — domain keywords, level mapping, salary benchmarks |
| File handling | SheetJS (xlsx) for CSV/XLSX parsing and export |

The frontend calls the Python API for all classification. A local JavaScript fallback is used if the API is unavailable, with a visible warning shown to the user.

---

## JSON Config Files

All classification data lives in `backend/json/` (synced from [logistics-data-pipeline](https://github.com/ppo741010/logistics-data-pipeline)):

| File | Purpose |
|------|---------|
| `logistics_config.json` | Domain keywords, fuzzy repair rules, level mapping, salary benchmarks |
| `skill_normalize.json` | Skill synonym map (also copied to `src/` for frontend use) |
| `skills_knowledge_map.json` | 992 job title → skills/level lookup entries |

---

## Local Development

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`. Set `VITE_API_URL=http://localhost:8000` in a `.env.local` file to point the frontend at your local backend.

Set `ANTHROPIC_API_KEY` in your environment to enable the AI fallback in local development.

---

## Feedback

Found a misclassification or have a suggestion? Use the feedback link inside the app.
