"""
Gemini classifier for Other/Noise logistics titles
----------------------------------------------------
Input:  logistics_classified_report.csv  (same folder as this script)
Output: gemini_noise_resolved.csv        (same folder as this script)

Does NOT touch Seek_job project or database.
Run from anywhere: python gemini_classify_noise.py
Requires: GEMINI_API_KEY as env var or in a .env file nearby
"""

import csv, json, time, os, sys
from pathlib import Path

# ── API Key ───────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv())
except ImportError:
    pass

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    print("ERROR: Set GEMINI_API_KEY as an environment variable or in a .env file.")
    sys.exit(1)

try:
    from google import genai
except ImportError:
    print("ERROR: Run: pip install google-genai")
    sys.exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)

# ── Paths (all relative to this script — no Seek_job dependency) ──────────────
HERE       = Path(__file__).parent
INPUT_CSV  = HERE / "logistics_classified_report.csv"
OUTPUT_CSV = HERE / "gemini_noise_resolved.csv"

BATCH_SIZE = 5
DELAY_SECS = 12

VALID_DOMAINS = [
    "Warehouse", "Transport", "Freight Forwarding", "Planning", "Operations",
    "Finance", "Sales", "IT Support", "Business Administration",
]

PROMPT_TEMPLATE = """You are a logistics industry job title classifier.

For each title + company pair, decide:
1. Is this a logistics/supply chain role? Company name is important context.
   e.g. "Branch Manager" at Mainfreight = logistics. "Branch Manager" at ANZ Bank = not logistics.
2. If yes, pick ONE domain:
   Warehouse | Transport | Freight Forwarding | Planning | Operations | Finance | Sales | IT Support | Business Administration
3. If no (retail, hospitality, construction, banking, etc.), use: Not Logistics

Return ONLY a JSON array, no markdown, no explanation:
[{{"title": "...", "domain": "Operations", "reason": "brief reason"}}]

Classify these:
{items}"""


def call_gemini(prompt: str, max_retries: int = 10) -> str:
    wait = 10
    for attempt in range(max_retries):
        try:
            resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
            return resp.text
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                print(f"  429 — waiting {wait}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
                wait *= 2
            else:
                raise
    raise Exception("Max retries exceeded")


def parse_gemini(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = "\n".join(text.split("\n")[1:]).rsplit("```", 1)[0]
    try:
        return json.loads(text)
    except Exception:
        s, e = text.find("["), text.rfind("]") + 1
        if s != -1 and e > s:
            try:
                return json.loads(text[s:e])
            except Exception:
                pass
    return []


def run():
    # ── 1. Load Other/Noise rows from CSV ─────────────────────────────────────
    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found.")
        print("Make sure logistics_classified_report.csv is in the same folder as this script.")
        sys.exit(1)

    all_rows   = list(csv.DictReader(open(INPUT_CSV, encoding="utf-8")))
    noise_rows = [r for r in all_rows if r.get("mapper_domain", "") in ("Other/Noise", "")]
    print(f"✓ Loaded {len(all_rows)} rows — {len(noise_rows)} are Other/Noise\n")

    # ── 2. Deduplicate by title + company ──────────────────────────────────────
    seen, unique_noise = set(), []
    for r in noise_rows:
        key = (r["job_title_clean"].strip().lower(), (r.get("company") or "").strip().lower())
        if key not in seen:
            seen.add(key)
            unique_noise.append(r)

    total_batches = (len(unique_noise) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Unique title+company combos: {len(unique_noise)}")
    print(f"Gemini batches of {BATCH_SIZE}: {total_batches}\n")

    # ── 3. Send to Gemini ──────────────────────────────────────────────────────
    gemini_results = {}

    for i in range(total_batches):
        batch = unique_noise[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        items = "\n".join(
            f'{j+1}. Title: "{r["job_title_clean"]}" | Company: "{r.get("company") or "Unknown"}"'
            for j, r in enumerate(batch)
        )
        print(f"Batch {i+1}/{total_batches} ({len(batch)} titles)...", end=" ", flush=True)

        try:
            raw    = call_gemini(PROMPT_TEMPLATE.format(items=items))
            parsed = parse_gemini(raw)
            for item in parsed:
                tk = item.get("title", "").strip().lower()
                for r in batch:
                    if r["job_title_clean"].strip().lower() == tk:
                        key = (r["job_title_clean"].strip().lower(), (r.get("company") or "").strip().lower())
                        gemini_results[key] = {
                            "domain": item.get("domain", "Other/Noise"),
                            "reason": item.get("reason", ""),
                        }
                        break
            print(f"OK ({len(parsed)} classified)")
        except Exception as e:
            print(f"FAILED: {e}")

        if i < total_batches - 1:
            time.sleep(DELAY_SECS)

    # ── 4. Write output CSV ────────────────────────────────────────────────────
    fieldnames = [
        "job_title_clean", "company", "location", "week",
        "seek_domain", "mapper_domain",
        "gemini_domain", "gemini_reason", "final_domain",
    ]

    resolved = confirmed = 0

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for r in noise_rows:
            key = (r["job_title_clean"].strip().lower(), (r.get("company") or "").strip().lower())
            g   = gemini_results.get(key, {"domain": "Other/Noise", "reason": "not processed"})
            gd  = g["domain"]

            if gd == "Not Logistics":
                final = "Other/Noise"
                confirmed += 1
            elif gd in VALID_DOMAINS:
                final = gd
                resolved += 1
            else:
                final = "Other/Noise"

            writer.writerow({
                "job_title_clean": r["job_title_clean"],
                "company":         r.get("company", ""),
                "location":        r.get("location", ""),
                "week":            r.get("week", ""),
                "seek_domain":     r.get("seek_domain", ""),
                "mapper_domain":   r.get("mapper_domain", ""),
                "gemini_domain":   gd,
                "gemini_reason":   g["reason"],
                "final_domain":    final,
            })

    print(f"\n{'='*48}")
    print(f"  Other/Noise processed:    {len(noise_rows)}")
    print(f"  Resolved to a domain:     {resolved}")
    print(f"  Confirmed non-logistics:  {confirmed}")
    print(f"  Still Other/Noise:        {len(noise_rows) - resolved - confirmed}")
    print(f"{'='*48}")
    print(f"\n✓ Output saved → {OUTPUT_CSV.name}")


if __name__ == "__main__":
    run()
