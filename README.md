# Urban Pulse

Urban news from 52 credible newsrooms, sorted by day, place and theme, refreshed
every four hours. Built for an urban designer who wants to catch up in ten
minutes rather than scroll five apps.

**Live site:** https://litevader16.github.io/urban-pulse/

---

## What it does

Pulls RSS from a fixed list of newsrooms, keeps only the items that read as urban
news, tags them against a 17-theme taxonomy, and publishes a static page.

- **Two views** — a day sheet showing one date at a time, and a month calendar
  that doubles as a date picker with per-day volume
- **Four places** — Ahmedabad · Bengaluru · India · World
- **Seventeen themes** in six families — Shelter & Land, Movement, Environment &
  Climate, People & Society, Design & Heritage, Tech & Data
- **Filter by individual newsroom**, grouped by editorial lean
- **Editorial lean on every story** — left, centre, right or specialist, so you
  always see who is telling you, and can read across the spectrum on purpose
- **Links out, always** — the site stores a headline, the publisher's own summary
  and a link. It never reproduces article text.

The interface is an icon rail (Places · Newsrooms · Topics · Search) that opens
one filter panel at a time, a centre sheet, and a charts rail. Clicking a bar in
either chart filters or jumps to that day.

## How it works

```
GitHub Action (every 4h)
   └─ scripts/fetch_news.py
        ├─ fetch 52 feeds          (threaded, failures are skipped not fatal)
        ├─ parse RSS / RDF / Atom  (one namespace-agnostic parser)
        ├─ score urban relevance   (scripts/taxonomy.py)
        ├─ tag up to 3 themes
        ├─ dedupe + merge into the 45-day archive
        └─ write data/news.json
   └─ commit if changed → GitHub Pages redeploys
```

The whole site is `index.html`, one stylesheet, one script and one JSON file.
No framework, no build step, no server, no API keys — nothing that can rot between
deploys.

**The fetcher is deliberately stdlib-only.** It runs unattended on a schedule; a
pinned dependency yanking a release should never be able to take the site down.

## The classifier

There is no AI in the pipeline, so `scripts/taxonomy.py` *is* the classifier. Two
independent judgements are made about every article:

1. **Is it about cities at all?** — an urban score built from explicit city words
   plus theme hits, minus a noise list.
2. **What is it about?** — per-theme scores; the top three are kept.

Keywords are weighted `strong=3 / medium=2 / weak=1`, so a single weak hit can
never admit an article on its own. Some hard-won details:

- **Headline-only feeds.** Most Indian city desks publish no description at all.
  Judging a ten-word title against a threshold calibrated for a full paragraph
  rejected literally everything from them, so thin items get their own bar, held
  up by a bonus for theme hits in the headline.
- **General desks must name the city.** A national or international desk covers
  everything, so thematic keywords alone are not evidence of urban news — an essay
  will eventually graze a context word somewhere in a long summary. General feeds
  must carry an urban marker *in the headline*. City desks are exempt: their whole
  beat is already one city.
- **Plurals.** Every pattern absorbs a trailing `s`/`es`. Without it `data center`
  silently fails to match `data centers`, and a whole theme under-reports.
- **Crime blotter is the main false positive.** `slum`, `layout` and `corporation`
  appear constantly in stories that have nothing to do with how a city is built,
  so blotter vocabulary carries a heavy negative weight.
- **Civic bodies are city words.** Naming HYDRAA, BBMP, MCD or PMC *is* naming a
  city, but none of them contain the string "city". Until they were added,
  genuine urban-governance reporting was rejected for never using the literal
  word in its headline.

Tuning is one file. If too much noise gets through, add to `NOISE`; if a beat is
under-covered, add phrases to that theme's `strong` list.

## Sources

Chosen for credibility and for a deliberate spread of viewpoint. Lean labels are
editorial orientation, not a quality judgement.

| Place | Newsrooms |
|---|---|
| **Ahmedabad** | Times of India Ahmedabad, Times of India Gujarat, Indian Express Ahmedabad |
| **Bengaluru** | Times of India Bengaluru, Indian Express Bangalore, The Hindu Bangalore, Citizen Matters Bengaluru |
| **India** | The Hindu (national · cities · environment), Indian Express (india · cities), Hindustan Times (india · cities), Times of India, Mint, Economic Times, ET RealEstate, Frontline, The Federal, News18, The News Minute, Mongabay India, Question of Cities, Citizen Matters |
| **World** | Guardian (cities · environment), New York Times (climate · real estate), The Atlantic, NPR, Grist, BBC, DW, Al Jazeera, The Conversation, Carbon Brief, Wall Street Journal, Financial Times, City Journal, National Review, Reason, Streetsblog, Smart Cities Dive, ArchDaily, Dezeen, Curbed, The Urbanist, Sightline Institute, Dialogue Earth, MIT Technology Review |

Spread: **left** Guardian, Grist, Frontline, The Federal · **centre-left** The Hindu,
NYT, Atlantic, NPR · **centre** BBC, DW, Al Jazeera, Indian Express, HT, TOI ·
**centre-right** WSJ, FT, Mint, Economic Times · **right** City Journal, National
Review, Reason, News18 · **specialist** the design, civic and science press.

### Wanted but unavailable

These have no usable public feed, or block automated fetches at the edge, so they
are left out rather than shipped broken. Each was tested directly:

- **Cloudflare / 403 to automation** — Next City, Planetizen, Bloomberg CityLab,
  Yale e360, Places Journal, Urban Institute, ULI, C40, The Third Pole,
  Business Standard, Smart Cities India, The Architect's Newspaper (answers a
  laptop, refuses GitHub's runners), Firstpost (same).
- **No feed at that path any more** — Governing, Scroll.in, The Wire, ThePrint,
  Down To Earth, Deccan Herald, Bangalore Mirror, Ahmedabad Mirror, IndiaSpend,
  ORF, World Bank Blogs, Context, Wired Cities.
- **Feed returns HTML, not XML** — Brookings, UN-Habitat, Domus, DeshGujarat,
  Urban Update, Article 14, Construction World.
- **Alive but stale or empty** — Swarajya (0 items), Metropolis (0), CNU (0),
  Moneycontrol (829 days old), Architectural Record (1,628 days old).

Also declined on judgement rather than availability: Deccan Chronicle (573-item
firehose, and Hyderabad/Chennai-focused rather than Bengaluru), and one outlet
whose feed works but which has a documented record of publishing fabricated
material.

**Language.** The classifier is an English keyword lexicon, so Gujarati and
Kannada newsrooms cannot be classified even where their feeds are healthy.
Supporting them means a second lexicon, not just a new entry in `sources.json`.

Feeds are judged on whether the newsroom is credible, not on whether it agrees
with anything. A working feed was still declined where the outlet has a
documented record of publishing fabricated material — a viewpoint mix is the
point, an accuracy mix is not.

## Running it locally

```bash
python3 scripts/fetch_news.py --dry-run --verbose   # classify, write nothing
python3 scripts/fetch_news.py                       # write data/news.json

python3 -m http.server 8899              # then open localhost:8899
```

`--dry-run` prints a per-feed breakdown of items seen versus kept, which is the
fastest way to see what a taxonomy change did.

## Maintenance

| Task | Where |
|---|---|
| Add or remove a newsroom | `scripts/sources.json` |
| Retune what counts as urban | `scripts/taxonomy.py` |
| Change thresholds, retention, caps | constants at the top of `scripts/fetch_news.py` |
| Change the schedule | `.github/workflows/fetch-news.yml` |

A feed that starts failing shows as a red dot in the site footer under
*Where this comes from*, with the error on hover — worth a glance every few weeks.
Failures never break a run; the fetcher skips them and carries on.

### Adding a source

```json
{
  "id": "example-city",
  "name": "Example Post — City Desk",
  "short": "Example Post",
  "url": "https://example.com/city/feed",
  "site": "https://example.com/city",
  "tier": "national",
  "lean": "centre",
  "specialist": false
}
```

`tier` is `ahmedabad` | `bengaluru` | `national` | `international`. Set
`specialist: true` only when the entire publication is already about cities — it
lowers the relevance bar substantially.

## Hosting

GitHub Pages serves from the **repository root** on `main` — which is why
`index.html`, `assets/` and `data/` sit at the top level rather than in `docs/`.
`.nojekyll` stops Jekyll from processing the site and shadowing `index.html`
with a rendered README.

## Design notes

Family colours come from a validated categorical palette. The slot order was
chosen by enumerating all 720 orderings and keeping only those that clear every
adjacent-pair gate in both light and dark — **four do**; this is one of them
(worst CVD ΔE 8.3, worst normal-vision ΔE 19.8). Three light-mode hues sit below
3:1 contrast on the page, so every colour chip always carries its text label:
colour never encodes anything on its own.

## Licence

Code is MIT. Article headlines, summaries and images belong to their publishers
and are shown here under fair dealing for the purpose of linking to the original.
