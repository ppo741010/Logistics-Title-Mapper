# Logistics Title Mapper

A browser-based tool for cleaning, classifying, and normalizing logistics job titles — built for recruiters, HR teams, and workforce analysts who work with messy job ad data.

**Live demo:** https://logistics-title-mapper.vercel.app/

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
- **Clean Title** — noise removed, abbreviations expanded
- **Functional Area** — which logistics domain the role belongs to
- **Seniority Level** — from Entry through to Executive
- **Work Nature** — Management, Specialist/Support, or Operational
- **Confidence Score** — High / Medium / Low with matched keywords shown
- **Review Flags** — highlights ambiguous or low-confidence classifications

### 2. Bulk Upload
Upload a CSV or XLSX file (up to 10,000 rows) and process everything at once:
- Auto-detect column names or manually map them
- **Clean Preview** — review before/after cleaning for every title before classification runs; edit any clean title manually before confirming
- Download structured output as CSV, JSON, or Excel

### 3. Title Cleaner
See exactly how titles are transformed — useful for understanding the cleaning rules before running a bulk job:
- Removes salary ranges, locations, shift patterns, contract types, noise phrases
- Expands abbreviations (`Sr.` → `Senior`, `FP&A` → `Financial Planning & Analysis`, `3PL` → `Third Party Logistics`)
- Normalizes ALL-CAPS titles

### 4. Skill Mapper
Paste raw skill phrases from job descriptions and normalize them to standard canonical labels:
- `warehouse management system` → `WMS`
- `advanced excel` → `Microsoft Excel (Advanced)`
- `lean six sigma` → `Lean Six Sigma`
- Covers logistics systems, Microsoft Office, Google Workspace, accounting software (Xero, MYOB), project management tools (Jira, Agile), HR systems, and soft skills

### 5. Export
Configure and download your structured output with selectable fields — raw title, clean title, functional area, work nature, seniority, confidence score, skills, flags, and more.

---

## Functional Areas

Roles are classified into 9 domains:

| Domain | Example Roles |
|--------|--------------|
| Warehouse | Warehouse Manager, Forklift Operator, Inventory Controller |
| Transport | Dispatch Coordinator, Fleet Manager, Driver |
| Freight Forwarding | Customs Broker, Import/Export Officer, Freight Coordinator |
| Planning | Demand Planner, Supply Chain Analyst, Procurement Manager |
| Operations | Operations Manager, Logistics Coordinator, Process Analyst |
| Finance | Accounts Payable, FP&A Manager, Payroll Officer |
| Sales | Account Manager, Business Development, Customer Service |
| IT Support | Systems Analyst, ERP Specialist, IT Support Officer |
| Business Administration | EA, HR Coordinator, Office Manager |

---

## How to Use

1. Go to **https://logistics-title-mapper.vercel.app/**
2. Use **Single Analyzer** to test individual titles
3. Use **Bulk Upload** to process a CSV or XLSX file
4. Review the Clean Preview, then run the classifier
5. Download your structured output

No account or installation required.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, deployed on Vercel |
| Backend | Python FastAPI, deployed on Render |
| Classification | Rule-based NLP engine (keyword scoring, fuzzy repair, description fallback) |
| File handling | SheetJS (xlsx) for CSV/XLSX parsing and export |

The frontend calls the Python API for all classification and cleaning. A local JavaScript fallback is used if the API is unavailable, with a visible warning shown to the user.

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

---

## Feedback

Found a misclassification or have a suggestion? Use the feedback link inside the app.
