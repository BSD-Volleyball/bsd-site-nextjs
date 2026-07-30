#!/usr/bin/env python3
"""Download archived bumpsetdrink.com results pages from the Wayback Machine.

The old league site was overwritten in place every season, so each *snapshot*
of a given URL is a different season. That makes the Wayback Machine the only
surviving source of match/playoff/roster data before 2024 (the old site's git
repo only reaches back to its 2024-08-27 "initial site copy" commit).

This script only downloads. Parsing happens offline against the cache so the
parsers can be iterated on without ever re-hitting archive.org.

Usage:
    python3 scripts/wayback/fetch_snapshots.py                 # all families
    python3 scripts/wayback/fetch_snapshots.py --only roster   # one family
    python3 scripts/wayback/fetch_snapshots.py --dry-run       # index only

Re-runs are free: anything already in the cache is skipped.
"""

import argparse
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mss_session import DEFAULT_MSS, make_session  # noqa: E402

CDX_URL = "https://web.archive.org/cdx/search/cdx"
WAYBACK = "https://web.archive.org/web"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_DIR = os.path.join(REPO_ROOT, "scripts", "data", "wayback")
RAW_DIR = os.path.join(CACHE_DIR, "raw")

# Page families that carry the data we want. Regexes are CDX `filter=original:`
# patterns, which must match the whole URL.
FAMILIES = {
    "stand": r".*/stand[a-z_0-9]*[.]html",
    "play": r".*/play[a-z_0-9]*[.]html",
    "roster": r".*/roster[a-z_0-9]*[.]html",
}

# Retryable conditions get these backoffs, in seconds.
BACKOFFS = [2, 4, 8, 16, 32]


def log(msg):
    print(msg, flush=True)


def cdx_query(session, family_regex, delay):
    """Fetch the CDX index for one page family.

    collapse=digest drops byte-identical consecutive captures -- the old site
    often sat unchanged for months, and four of the Fall 2003 playoff snapshots
    are the same bytes.
    """
    params = {
        "url": "bumpsetdrink.com",
        "matchType": "domain",
        "output": "json",
        "fl": "original,timestamp,digest,statuscode,mimetype",
        "filter": ["statuscode:200", f"original:{family_regex}"],
        "collapse": "digest",
        "limit": "20000",
    }
    resp = session.get(CDX_URL, params=params, timeout=120)
    resp.raise_for_status()
    time.sleep(delay)
    rows = resp.json()
    if not rows:
        return []
    header, *body = rows
    return [dict(zip(header, r)) for r in body]


def snapshot_path(row):
    """Cache location for a snapshot: raw/<timestamp>/<basename>."""
    basename = row["original"].split("?")[0].rstrip("/").split("/")[-1].lower()
    if not basename:
        basename = "index.html"
    return os.path.join(RAW_DIR, row["timestamp"], basename)


def fetch_one(session, row, delay, timeout):
    """Download one snapshot with backoff. Returns (body, attempts, note)."""
    # The `id_` modifier asks Wayback for the ORIGINAL bytes, with no injected
    # toolbar and no rewritten links -- essential for parsing.
    url = f"{WAYBACK}/{row['timestamp']}id_/{row['original']}"

    for attempt in range(len(BACKOFFS) + 1):
        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)
            # Wayback rate-limits by refusing connections or returning empties
            # rather than by sending a clean 429, so treat a blank 200 as a
            # throttle signal too.
            if resp.status_code in (429, 503, 504):
                note = f"http {resp.status_code}"
            elif not resp.content:
                note = "empty body"
            else:
                return resp.text, attempt + 1, f"http {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 - any transport failure is retryable
            note = f"{type(exc).__name__}: {exc}"[:120]

        if attempt < len(BACKOFFS):
            time.sleep(BACKOFFS[attempt])

    return None, len(BACKOFFS) + 1, note


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--only",
        default=",".join(FAMILIES),
        help=f"comma-separated families to fetch ({', '.join(FAMILIES)})",
    )
    ap.add_argument("--limit", type=int, help="stop after N downloads (testing)")
    ap.add_argument("--delay", type=float, default=1.2, help="seconds between requests")
    ap.add_argument("--timeout", type=float, default=90.0)
    ap.add_argument("--mss", type=int, default=DEFAULT_MSS)
    ap.add_argument("--force", action="store_true", help="re-download cached snapshots")
    ap.add_argument("--dry-run", action="store_true", help="build the index, download nothing")
    args = ap.parse_args()

    families = [f.strip() for f in args.only.split(",") if f.strip()]
    unknown = [f for f in families if f not in FAMILIES]
    if unknown:
        ap.error(f"unknown families: {', '.join(unknown)}")

    os.makedirs(RAW_DIR, exist_ok=True)
    session = make_session(mss=args.mss)

    log(f"MSS clamped to {args.mss} (guards against the 1450 path-MTU blackhole)")

    rows = []
    for family in families:
        log(f"indexing {family}* ...")
        found = cdx_query(session, FAMILIES[family], args.delay)
        for r in found:
            r["family"] = family
        log(f"  {len(found)} snapshots")
        rows.extend(found)

    # Stable order so runs are reproducible and resumable.
    rows.sort(key=lambda r: (r["original"], r["timestamp"]))

    with open(os.path.join(CACHE_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=1)
    log(f"\nindexed {len(rows)} snapshots -> {os.path.join(CACHE_DIR, 'index.json')}")

    if args.dry_run:
        log("dry run: nothing downloaded")
        return 0

    logfile = open(os.path.join(CACHE_DIR, "fetch-log.jsonl"), "a", encoding="utf-8")
    downloaded = cached = failed = 0

    try:
        for i, row in enumerate(rows, 1):
            dest = snapshot_path(row)
            if os.path.exists(dest) and not args.force:
                cached += 1
                continue
            if args.limit and downloaded >= args.limit:
                break

            started = time.time()
            body, attempts, note = fetch_one(session, row, args.delay, args.timeout)
            elapsed = round(time.time() - started, 2)
            name = os.path.basename(dest)

            if body is None:
                failed += 1
                log(f"[{i}/{len(rows)}] FAIL {row['timestamp']} {name} ({note})")
            else:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "w", encoding="utf-8") as fh:
                    fh.write(body)
                downloaded += 1
                log(f"[{i}/{len(rows)}] ok   {row['timestamp']} {name} {len(body)}b")

            logfile.write(
                json.dumps(
                    {
                        "original": row["original"],
                        "timestamp": row["timestamp"],
                        "family": row["family"],
                        "bytes": len(body) if body else 0,
                        "sha256": hashlib.sha256(body.encode()).hexdigest() if body else None,
                        "attempts": attempts,
                        "note": note,
                        "elapsed": elapsed,
                    }
                )
                + "\n"
            )
            logfile.flush()
            time.sleep(args.delay)
    except KeyboardInterrupt:
        log("\ninterrupted -- progress is cached, just re-run to resume")
    finally:
        logfile.close()

    log(f"\ndownloaded {downloaded} | already cached {cached} | failed {failed}")
    log(f"cache: {RAW_DIR}")
    if failed:
        log("re-run to retry failures (successful snapshots are skipped)")
    return 1 if failed and downloaded == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
