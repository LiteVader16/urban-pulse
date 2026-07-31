#!/usr/bin/env python3
"""
Urban Pulse — feed fetcher.

Pulls every feed in sources.json, keeps only what reads as urban news, tags it
against taxonomy.py, merges with the existing archive and writes
docs/data/news.json.

Deliberately stdlib-only. This runs unattended on a schedule; a pinned
dependency that yanks a release should never be able to take the site down.

    python3 scripts/fetch_news.py              # normal run
    python3 scripts/fetch_news.py --dry-run    # fetch + classify, write nothing
    python3 scripts/fetch_news.py --verbose    # per-feed accounting
"""

import argparse
import gzip
import hashlib
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import taxonomy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCES_PATH = os.path.join(HERE, "sources.json")
OUT_PATH = os.path.join(ROOT, "docs", "data", "news.json")

# --- Tunables -----------------------------------------------------------

RETENTION_DAYS = 45          # how far back the archive reaches
MAX_ARTICLES = 1400          # hard cap so the JSON stays quick to load
MAX_PER_FEED = 60            # per-run intake ceiling per feed
MAX_KEEP_PER_FEED = 12       # stops the design blogs drowning everything else
SUMMARY_CHARS = 340          # trimmed to keep payload small and cards even
FETCH_TIMEOUT = 25
FETCH_WORKERS = 8
RETRIES = 2

# Admission thresholds. Specialist publications are already about cities, so
# they only need a theme. General newsrooms must clear a real urban score.
GENERAL_MIN_URBAN = 6
GENERAL_MIN_THEME = 3
SPECIALIST_MIN_URBAN = -1

# Many feeds (most Indian city desks) publish headline-only items. Judging a
# ten-word title against a threshold calibrated for a full paragraph rejects
# everything, so thin items get their own bar — held up by the headline bonus
# in taxonomy.score_themes rather than by lowering the standard outright.
THIN_SUMMARY_CHARS = 80
THIN_MIN_URBAN = 3
THIN_MIN_THEME = 3

# Tried in order across retries. Some publishers serve feeds happily to a
# self-identifying reader but block a browser string coming from a datacenter
# IP, and some do the exact opposite — rotating recovers both cases. This is
# why two feeds that work from a laptop can still fail on a CI runner.
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "UrbanPulse/1.0 (+https://github.com/LiteVader16/urban-pulse) feed-reader",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36",
]

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
IMG_RE = re.compile(r"""<img[^>]+src\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
TRACKING_PARAMS = re.compile(r"^(utm_|fbclid|gclid|ref|source|at_|CMP|cmp)", re.IGNORECASE)


# --- Fetching -----------------------------------------------------------


def fetch(url):
    """GET a feed, following redirects, transparently gunzipping.

    Each attempt uses a different User-Agent, so a publisher that rejects one
    client string still has a chance of answering the next.
    """
    last_error = None
    for attempt in range(RETRIES + 1):
        agent = USER_AGENTS[attempt % len(USER_AGENTS)]
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": agent,
                    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
                    "Accept-Language": "en-GB,en;q=0.9",
                    "Accept-Encoding": "gzip",
                },
            )
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw
        except Exception as exc:  # noqa: BLE001 - a dead feed must not be fatal
            last_error = exc
    raise last_error


# --- XML helpers --------------------------------------------------------


def local(tag):
    """Strip the namespace: '{http://...}item' -> 'item'."""
    return tag.rsplit("}", 1)[-1].lower() if "}" in tag else tag.lower()


def child_text(node, *names):
    """First non-empty child matching any of the given local names."""
    wanted = {n.lower() for n in names}
    for kid in node:
        if local(kid.tag) in wanted:
            text = (kid.text or "").strip()
            if text:
                return text
    return ""


def clean_text(value):
    """Feed summaries arrive as HTML, sometimes double-escaped."""
    if not value:
        return ""
    text = html.unescape(value)
    if "&lt;" in text or "&amp;" in text:
        text = html.unescape(text)
    text = TAG_RE.sub(" ", text)
    text = WS_RE.sub(" ", text).strip()
    return text


def trim(text, limit=SUMMARY_CHARS):
    """Cut on a word boundary and add an ellipsis if we actually cut."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.—-")
    return cut + "…"


def parse_date(node):
    """RSS uses RFC 822, Atom uses ISO 8601, and plenty of feeds use neither."""
    raw = child_text(node, "pubdate", "published", "updated", "date", "created")
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        iso = raw.strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(iso)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def extract_link(node):
    """RSS puts the URL in <link> text, Atom in a <link href> attribute."""
    for kid in node:
        if local(kid.tag) == "link":
            text = (kid.text or "").strip()
            if text.startswith("http"):
                return text
            href = kid.get("href", "").strip()
            rel = kid.get("rel", "alternate")
            if href.startswith("http") and rel in ("alternate", ""):
                return href
    guid = child_text(node, "guid", "id")
    return guid if guid.startswith("http") else ""


def extract_image(node):
    """Try every place a feed might hide an image, best quality first."""
    best = ""
    best_width = -1
    for kid in node:
        name = local(kid.tag)
        if name in ("content", "thumbnail", "image"):
            url = kid.get("url") or kid.get("href") or ""
            mime = kid.get("type", "")
            medium = kid.get("medium", "")
            if url.startswith("http") and (
                medium == "image" or mime.startswith("image") or not mime
            ):
                try:
                    width = int(kid.get("width") or 0)
                except ValueError:
                    width = 0
                if width > best_width:
                    best, best_width = url, width
        elif name == "enclosure":
            url = kid.get("url", "")
            if url.startswith("http") and kid.get("type", "").startswith("image"):
                if best_width < 0:
                    best, best_width = url, 0
    if best:
        return best
    # Last resort: the first <img> inside the body HTML.
    for kid in node:
        if local(kid.tag) in ("encoded", "description", "summary", "content"):
            match = IMG_RE.search(kid.text or "")
            if match:
                return html.unescape(match.group(1))
    return ""


def iter_items(root):
    """Yield <item> (RSS/RDF) and <entry> (Atom) nodes wherever they sit."""
    for node in root.iter():
        if local(node.tag) in ("item", "entry"):
            yield node


# --- Normalisation ------------------------------------------------------


def canonical_url(url):
    """Strip tracking parameters so the same story from two paths dedupes."""
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return url
    kept = [
        (k, v)
        for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
        if not TRACKING_PARAMS.match(k)
    ]
    query = urllib.parse.urlencode(kept)
    path = parts.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, ""))


def title_key(title):
    """Normalised title, for catching the same wire copy across newsrooms."""
    key = re.sub(r"[^a-z0-9 ]+", " ", title.lower())
    key = WS_RE.sub(" ", key).strip()
    return key[:110]


def article_id(url, title):
    return hashlib.sha1((canonical_url(url) + "|" + title_key(title)).encode("utf-8")).hexdigest()[:16]


# --- Per-source processing ----------------------------------------------


def process_source(source, cutoff, verbose=False):
    """Fetch one feed and return (articles, health)."""
    health = {
        "id": source["id"],
        "name": source["name"],
        "ok": False,
        "seen": 0,
        "kept": 0,
        "error": None,
    }
    try:
        raw = fetch(source["url"])
    except urllib.error.HTTPError as exc:
        # The status code is the whole diagnosis: 403 means we are being
        # blocked, 404 means the feed moved. Surfacing it in the footer makes
        # a dead source actionable instead of merely red.
        health["error"] = f"HTTP {exc.code}"
        return [], health
    except Exception as exc:  # noqa: BLE001
        health["error"] = f"fetch failed: {type(exc).__name__}"
        return [], health

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        # Some feeds ship stray control characters or a BOM before the prolog.
        try:
            text = raw.decode("utf-8", errors="replace")
            text = re.sub(r"^[^<]+", "", text)
            text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
            root = ElementTree.fromstring(text.encode("utf-8"))
        except ElementTree.ParseError as exc:
            health["error"] = f"parse failed: {exc}"
            return [], health

    health["ok"] = True
    specialist = bool(source.get("specialist"))
    articles = []

    for node in iter_items(root):
        if health["seen"] >= MAX_PER_FEED or health["kept"] >= MAX_KEEP_PER_FEED:
            break
        health["seen"] += 1

        title = clean_text(child_text(node, "title"))
        url = extract_link(node)
        if not title or not url:
            continue

        published = parse_date(node)
        if published is None:
            # Undated items are usually feed furniture; only trust dated news.
            continue
        if published < cutoff:
            continue
        if published > datetime.now(timezone.utc) + timedelta(days=1):
            continue  # a few feeds post-date items; ignore the future

        body = child_text(node, "description", "summary", "encoded", "content", "subtitle")
        summary = clean_text(body)

        verdict = taxonomy.analyse(title, summary)
        themes = verdict["themes"]
        score = verdict["urban"]
        strongest = max(themes.values()) if themes else 0

        if specialist:
            if not themes or score < SPECIALIST_MIN_URBAN:
                continue
        else:
            thin = len(summary) < THIN_SUMMARY_CHARS
            min_urban = THIN_MIN_URBAN if thin else GENERAL_MIN_URBAN
            min_theme = THIN_MIN_THEME if thin else GENERAL_MIN_THEME
            if score < min_urban or strongest < min_theme:
                continue
            # A general national or international desk covers everything, so
            # thematic keywords alone are not evidence of city news: demand an
            # explicit urban marker, and demand it in the headline. Essayistic
            # publications will always graze a context word somewhere in a long
            # summary — requiring the title to announce the city is what keeps
            # foreign-policy features and wildlife research out. City desks are
            # exempt, since their whole beat is already one city.
            if source["tier"] in ("national", "international"):
                if not verdict["context"] or not verdict["titleSignal"]:
                    continue

        top_themes = [t for t, _ in sorted(themes.items(), key=lambda kv: -kv[1])[:3]]

        # A national story that is plainly about one of the two home cities
        # belongs on that city's page, not buried in the national feed.
        tier = source["tier"]
        if tier in ("national", "international"):
            city = taxonomy.detect_city(title + " . " + summary)
            if city:
                tier = city

        articles.append(
            {
                "id": article_id(url, title),
                "title": trim(title, 180),
                "url": url,
                "summary": trim(summary),
                "image": extract_image(node),
                "source": source["id"],
                "sourceName": source["short"],
                "lean": source["lean"],
                "tier": tier,
                "published": published.isoformat().replace("+00:00", "Z"),
                "themes": top_themes,
                "score": score,
            }
        )
        health["kept"] += 1

    if verbose:
        print(
            f"  {source['id']:<26} seen={health['seen']:<4} kept={health['kept']:<4}"
            f" {health['error'] or ''}"
        )
    return articles, health


# --- Assembly -----------------------------------------------------------


def load_existing():
    if not os.path.exists(OUT_PATH):
        return []
    try:
        with open(OUT_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh).get("articles", [])
    except (json.JSONDecodeError, OSError):
        return []


def merge(existing, incoming, cutoff):
    """Newest first, deduped by id, canonical URL and normalised title."""
    seen_ids, seen_urls, seen_titles = set(), set(), set()
    merged = []
    for article in sorted(
        incoming + existing, key=lambda a: a.get("published", ""), reverse=True
    ):
        try:
            published = datetime.fromisoformat(article["published"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if published < cutoff:
            continue
        url_key = canonical_url(article.get("url", ""))
        t_key = title_key(article.get("title", ""))
        if article["id"] in seen_ids or url_key in seen_urls or t_key in seen_titles:
            continue
        seen_ids.add(article["id"])
        seen_urls.add(url_key)
        seen_titles.add(t_key)
        merged.append(article)
        if len(merged) >= MAX_ARTICLES:
            break
    return merged


def build_stats(articles):
    """Counts the front end needs for its filter chips and coverage chart."""
    by_tier, by_theme, by_lean, by_source = {}, {}, {}, {}
    daily = {}
    for article in articles:
        by_tier[article["tier"]] = by_tier.get(article["tier"], 0) + 1
        by_lean[article["lean"]] = by_lean.get(article["lean"], 0) + 1
        by_source[article["sourceName"]] = by_source.get(article["sourceName"], 0) + 1
        for theme in article["themes"]:
            by_theme[theme] = by_theme.get(theme, 0) + 1
        day = article["published"][:10]
        daily.setdefault(day, {})
        daily[day]["total"] = daily[day].get("total", 0) + 1

    today = datetime.now(timezone.utc).date()
    series = []
    for offset in range(13, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        series.append({"date": day, "count": daily.get(day, {}).get("total", 0)})

    return {
        "total": len(articles),
        "byTier": by_tier,
        "byTheme": by_theme,
        "byLean": by_lean,
        "bySource": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "daily": series,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch and classify urban news.")
    parser.add_argument("--dry-run", action="store_true", help="do not write news.json")
    parser.add_argument("--verbose", action="store_true", help="per-feed accounting")
    args = parser.parse_args()

    with open(SOURCES_PATH, "r", encoding="utf-8") as fh:
        sources = json.load(fh)["sources"]

    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    print(f"Fetching {len(sources)} feeds…")

    incoming, health = [], []
    with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as pool:
        futures = {
            pool.submit(process_source, src, cutoff, args.verbose): src for src in sources
        }
        for future in as_completed(futures):
            src = futures[future]
            try:
                articles, feed_health = future.result()
            except Exception as exc:  # noqa: BLE001
                articles = []
                feed_health = {
                    "id": src["id"], "name": src["name"], "ok": False,
                    "seen": 0, "kept": 0, "error": f"{type(exc).__name__}: {exc}",
                }
            incoming.extend(articles)
            health.append(feed_health)

    health.sort(key=lambda h: h["id"])
    ok_count = sum(1 for h in health if h["ok"])
    failed = [h for h in health if not h["ok"]]

    existing = load_existing()
    articles = merge(existing, incoming, cutoff)

    print(f"  feeds ok         : {ok_count}/{len(sources)}")
    print(f"  new this run     : {len(incoming)}")
    print(f"  archive (<= {RETENTION_DAYS}d): {len(articles)}")
    if failed:
        print("  failing feeds    : " + ", ".join(h["id"] for h in failed))

    payload = {
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "retentionDays": RETENTION_DAYS,
        "families": taxonomy.FAMILIES,
        "themes": taxonomy.theme_meta(),
        "sources": [
            {k: s[k] for k in ("id", "name", "short", "site", "tier", "lean")}
            for s in sources
        ],
        "health": health,
        "stats": build_stats(articles),
        "articles": articles,
    }

    if args.dry_run:
        print("\n[dry run] nothing written.")
        top = sorted(payload["stats"]["byTheme"].items(), key=lambda kv: -kv[1])
        for theme, count in top:
            print(f"    {taxonomy.THEMES[theme]['label']:<32} {count}")
        return 0

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"\nWrote {OUT_PATH} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
