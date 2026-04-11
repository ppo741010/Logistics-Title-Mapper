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

### Clean Titles
Removes noise from raw job titles automatically:
- Salary ranges (`$65k–$75k`, `$28ph`)
- Contract types (`FTC`, `fixed term`, `temp role`, `6-month contract`)
- Location suffixes (`- Auckland`, `| Singapore`, `, London UK`)
- Shift patterns (`night shift`, `day shift`, `casual`)
- Common phrases (`apply now`, `immediate start`, `great opportunity`)
- Expands abbreviations (`Sr.` → `Senior`, `Ops Mgr` → `Operations Manager`, `VP` → `Vice President`, `DC` → `Distribution Centre`)

### Classify Roles
Suggests a structured output for each title:
- **Functional Area** — which logistics domain the role belongs to (Warehouse, Transport, Freight Forwarding, Planning, Operations, Finance, Sales, IT Support, Business Administration)
- **Seniority Level** — from Entry through to Executive, inferred from title keywords
- **Work Nature** — Management, Specialist/Support, or Operational
- **Confidence Score** — how certain the classification is, with a clear High / Medium / Low indicator

### Normalize Skills
Maps raw skill phrases from job descriptions to standard canonical labels:
- `warehouse management system` → `WMS`
- `advanced excel` → `Microsoft Excel (Advanced)`
- `transport management system` → `TMS`
- and more

### Flag for Review
Automatically highlights titles that need a human check:
- Low confidence classifications
- Cross-functional roles (e.g. Warehouse + Dispatch signals)
- Titles outside the logistics domain, with a specific reason (detected non-logistics keyword, or no logistics keywords found at all)

### Bulk Processing
Upload a CSV or XLSX file with up to 10,000 rows, map your own column names, and download structured output as CSV, JSON, or XLSX — ready for downstream use.

---

## How to Use

1. Go to https://logistics-title-mapper.vercel.app/
2. Use **Single Analyzer** to test individual titles, or **Bulk Upload** to process a file
3. Map your column names (raw title, description, country) if using bulk mode
4. Download the structured output

No account or installation required. Everything runs in the browser.

---

## Tech Stack

- React + Vite
- SheetJS (xlsx) for file parsing and export
- Deployed on Vercel

---

## Feedback

Found a misclassification or have a suggestion? Use the feedback link inside the app.
