"""
Gemini classifier for Other/Noise logistics titles
----------------------------------------------------
Input:  logistics_classified_report.csv  (same folder as this script)
Output: gemini_noise_resolved.csv        (same folder as this script)

Does NOT touch Seek_job project or database.
Run from anywhere: python gemini_classify_noise.py
Requires: GEMINI_API_KEY as env var or in a .env file nearby

Features:
- Checkpoint/resume: saves progress to gemini_checkpoint.json after each batch
- Rate limiter: max 10 requests/min (free tier safe), configurable
- Capped retry: max 60s wait between retries, no runaway exponential backoff
- Company-aware matching: fixes title-only matching bug
- Multi-key rotation: add GEMINI_API_KEY_2, GEMINI_API_KEY_3 etc. to .env for
  automatic failover when daily quota (1500 RPD) is exhausted on one key
"""

import csv, json, time, os, sys
from pathlib import Path
from collections import deque

# ── API Keys (supports multiple for rotation) ─────────────────────────────────
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv())
except ImportError:
    pass

def _load_keys() -> list:
    keys = []
    # Primary key
    k = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if k:
        keys.append(k)
    # Extra keys: GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
    for i in range(2, 10):
        k = os.environ.get(f"GEMINI_API_KEY_{i}")
        if k:
            keys.append(k)
    return keys

API_KEYS = _load_keys()
if not API_KEYS:
    print("ERROR: Set GEMINI_API_KEY (and optionally GEMINI_API_KEY_2, _3...) in .env")
    sys.exit(1)

print(f"✓ Loaded {len(API_KEYS)} API key(s)")

try:
    from google import genai
except ImportError:
    print("ERROR: Run: pip install google-genai")
    sys.exit(1)

_key_index   = 0
_exhausted   = set()   # indices of keys with daily quota exhausted

def _make_client(idx: int):
    return genai.Client(api_key=API_KEYS[idx])

client = _make_client(_key_index)

# ── Paths ─────────────────────────────────────────────────────────────────────
HERE            = Path(__file__).parent
INPUT_CSV       = HERE / "logistics_classified_report.csv"
OUTPUT_CSV      = HERE / "gemini_noise_resolved.csv"
CHECKPOINT_FILE = HERE / "gemini_checkpoint.json"

# ── Config ────────────────────────────────────────────────────────────────────
BATCH_SIZE       = 5    # titles per Gemini call
REQUESTS_PER_MIN = 10   # free tier: 15 RPM — stay conservatively under
MAX_RETRY_WAIT   = 60   # seconds — cap on retry wait (no runaway backoff)
MAX_RETRIES      = 2    # on 429: only retry twice then skip (save daily quota)

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

Return ONLY a JSON array, no markdown, no explanation.
IMPORTANT: include both "title" AND "company" in each result so I can match them back.
[{{"title": "...", "company": "...", "domain": "Operations", "reason": "brief reason"}}]

Classify these:
{items}"""


# ── Rate Limiter ──────────────────────────────────────────────────────────────
class RateLimiter:
    """Sliding window rate limiter — ensures max N requests per 60s."""
    def __init__(self, max_per_minute: int):
        self.max_per_minute = max_per_minute
        self.timestamps = deque()

    def wait(self):
        now = time.time()
        # Remove timestamps older than 60s
        while self.timestamps and now - self.timestamps[0] > 60:
            self.timestamps.popleft()

        if len(self.timestamps) >= self.max_per_minute:
            sleep_for = 60 - (now - self.timestamps[0]) + 1
            if sleep_for > 0:
                print(f"  [rate limiter] waiting {sleep_for:.0f}s to stay under {self.max_per_minute} RPM...", flush=True)
                time.sleep(sleep_for)

        self.timestamps.append(time.time())


rate_limiter = RateLimiter(REQUESTS_PER_MIN)


# ── Gemini call with key rotation + capped retry ─────────────────────────────
def _rotate_key():
    """Switch to the next available API key. Returns True if switched."""
    global client, _key_index
    for offset in range(1, len(API_KEYS)):
        next_idx = (_key_index + offset) % len(API_KEYS)
        if next_idx not in _exhausted:
            _key_index = next_idx
            client = _make_client(_key_index)
            print(f"  [key rotation] switched to key #{_key_index + 1}", flush=True)
            return True
    return False  # all keys exhausted


def call_gemini(prompt: str) -> str:
    global _key_index
    wait = 10
    for attempt in range(MAX_RETRIES):
        rate_limiter.wait()
        try:
            resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
            return resp.text
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                # If daily quota exhausted, try rotating to another key immediately
                if "PerDay" in err or "per_day" in err.lower() or "limit: 0" in err:
                    print(f"  daily quota exhausted on key #{_key_index + 1}", flush=True)
                    _exhausted.add(_key_index)
                    if _rotate_key():
                        wait = 10  # reset wait for new key
                        continue
                    else:
                        raise Exception("All API keys exhausted for today")
                capped = min(wait, MAX_RETRY_WAIT)
                print(f"  429 — waiting {capped}s (attempt {attempt+1}/{MAX_RETRIES})", flush=True)
                time.sleep(capped)
                wait = min(wait * 2, MAX_RETRY_WAIT)
            else:
                raise
    raise Exception("Max retries exceeded")


# ── Parse Gemini JSON response ────────────────────────────────────────────────
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


# ── Checkpoint helpers ────────────────────────────────────────────────────────
def load_checkpoint() -> dict:
    if CHECKPOINT_FILE.exists():
        try:
            data = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
            print(f"✓ Resuming from checkpoint: {len(data)} keys already done")
            return data
        except Exception:
            print("  Warning: checkpoint file corrupt, starting fresh")
    return {}


def save_checkpoint(results: dict):
    CHECKPOINT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Main ──────────────────────────────────────────────────────────────────────
def run():
    # 1. Load Other/Noise rows
    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found.")
        sys.exit(1)

    with open(INPUT_CSV, encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    noise_rows = [r for r in all_rows if r.get("mapper_domain", "") in ("Other/Noise", "")]
    print(f"✓ Loaded {len(all_rows)} rows — {len(noise_rows)} are Other/Noise\n")

    # 2. Deduplicate by title + company
    seen, unique_noise = set(), []
    for r in noise_rows:
        key = (r["job_title_clean"].strip().lower(), (r.get("company") or "").strip().lower())
        if key not in seen:
            seen.add(key)
            unique_noise.append(r)

    total_batches = (len(unique_noise) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Unique title+company combos: {len(unique_noise)}")
    print(f"Gemini batches of {BATCH_SIZE}: {total_batches}")
    print(f"Rate limit: {REQUESTS_PER_MIN} RPM  |  Max retry wait: {MAX_RETRY_WAIT}s\n")

    # 3. Load checkpoint, skip already-done keys
    gemini_results = load_checkpoint()
    done_keys = set(gemini_results.keys())

    skipped = sum(
        1 for r in unique_noise
        if f"{r['job_title_clean'].strip().lower()}|||{(r.get('company') or '').strip().lower()}" in done_keys
    )
    if skipped:
        print(f"  Skipping {skipped} already-processed combos\n")

    # 4. Send to Gemini (skip done batches)
    for i in range(total_batches):
        batch = unique_noise[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]

        # Skip batch if all items already in checkpoint
        batch_keys = [
            f"{r['job_title_clean'].strip().lower()}|||{(r.get('company') or '').strip().lower()}"
            for r in batch
        ]
        if all(k in done_keys for k in batch_keys):
            continue

        items = "\n".join(
            f'{j+1}. Title: "{r["job_title_clean"]}" | Company: "{r.get("company") or "Unknown"}"'
            for j, r in enumerate(batch)
        )
        print(f"Batch {i+1}/{total_batches} ({len(batch)} titles)...", end=" ", flush=True)

        try:
            raw    = call_gemini(PROMPT_TEMPLATE.format(items=items))
            parsed = parse_gemini(raw)

            for item in parsed:
                # Match by title + company (fixes title-only matching bug)
                item_title   = item.get("title", "").strip().lower()
                item_company = item.get("company", "").strip().lower()
                ck = f"{item_title}|||{item_company}"

                # Fallback: if company missing in response, match by title only (best effort)
                if ck not in [k for k in batch_keys]:
                    for bk in batch_keys:
                        if bk.split("|||")[0] == item_title:
                            ck = bk
                            break

                gemini_results[ck] = {
                    "domain": item.get("domain", "Other/Noise"),
                    "reason": item.get("reason", ""),
                }

            save_checkpoint(gemini_results)
            print(f"OK ({len(parsed)} classified)", flush=True)

        except Exception as e:
            err = str(e)
            if "Max retries exceeded" in err or "429" in err or "RESOURCE_EXHAUSTED" in err:
                print(f"SKIPPED (quota): will retry next run via checkpoint", flush=True)
            else:
                print(f"FAILED: {e}", flush=True)

    # 5. Write output CSV
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
            ck = f"{r['job_title_clean'].strip().lower()}|||{(r.get('company') or '').strip().lower()}"
            g  = gemini_results.get(ck, {"domain": "Other/Noise", "reason": "not processed"})
            gd = g["domain"]

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

    # Clean up checkpoint after successful completion
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()
        print("  (checkpoint deleted — run complete)")

    print(f"\n{'='*48}")
    print(f"  Other/Noise processed:    {len(noise_rows)}")
    print(f"  Resolved to a domain:     {resolved}")
    print(f"  Confirmed non-logistics:  {confirmed}")
    print(f"  Still Other/Noise:        {len(noise_rows) - resolved - confirmed}")
    print(f"{'='*48}")
    print(f"\n✓ Output saved → {OUTPUT_CSV.name}")


if __name__ == "__main__":
    run()
