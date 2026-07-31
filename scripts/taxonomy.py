"""
Urban Pulse — theme taxonomy and relevance lexicon.

This module is the classifier. There is no AI in the pipeline, so the quality of
the whole site rests on these word lists. Two independent judgements are made
about every article:

  1. IS IT ABOUT CITIES AT ALL?  -> urban_score, from URBAN_CONTEXT + theme hits
                                    minus NOISE. General newsroom feeds must
                                    clear a threshold; specialist feeds need far
                                    less convincing.
  2. WHAT IS IT ABOUT?           -> per-theme scores, top 3 kept.

Weights: strong=3 (phrase is unambiguously this theme), medium=2 (usually this
theme), weak=1 (suggestive, needs corroboration). A single weak hit can never
admit an article on its own, which is what keeps cricket scores out.
"""

import re

# --- Families -----------------------------------------------------------
# Themes are grouped so the UI can offer six filter chips instead of seventeen.

FAMILIES = {
    "shelter": {"label": "Shelter & Land", "order": 1},
    "movement": {"label": "Movement", "order": 2},
    "environment": {"label": "Environment & Climate", "order": 3},
    "society": {"label": "People & Society", "order": 4},
    "design": {"label": "Design & Heritage", "order": 5},
    "tech": {"label": "Tech & Data", "order": 6},
}

# --- Themes -------------------------------------------------------------

THEMES = {
    "housing": {
        "label": "Housing & Affordability",
        "family": "shelter",
        "strong": [
            "affordable housing", "social housing", "public housing", "council housing",
            "housing crisis", "housing shortage", "housing policy", "housing affordability",
            "rent control", "rent cap", "rental market", "renters", "tenants rights",
            "homelessness", "homeless shelter", "eviction", "evictions",
            "slum rehabilitation", "housing scheme", "pradhan mantri awas",
            "inclusionary zoning", "right to buy", "first-time buyers",
            "build to rent", "housing supply", "missing middle housing",
        ],
        "medium": [
            "rent rise", "rents", "rent hike", "mortgage", "home loan",
            "housing board", "housing society", "tenement", "affordability",
            "homeownership", "home ownership", "landlord", "landlords",
            "squatting", "overcrowding", "dwelling units", "low-income housing",
        ],
        "weak": ["housing", "apartment", "apartments", "flats", "tenants", "rent", "homes"],
    },
    "realestate": {
        "label": "Real Estate & Economy",
        "family": "shelter",
        "strong": [
            "real estate market", "property market", "property prices", "land prices",
            "commercial real estate", "office vacancy", "office market",
            "land acquisition", "land pooling", "land value capture", "circle rate",
            "stamp duty", "property tax", "floor space index", "floor area ratio",
            "development charges", "land use change", "redevelopment project",
            "special economic zone", "central business district",
        ],
        "medium": [
            "developers", "developer", "realty", "real estate", "property registration",
            "housing sales", "commercial space", "retail space", "co-working",
            "land parcel", "land bank", "construction sector", "gentrification",
            "urban economy", "city economy", "downtown recovery",
        ],
        "weak": ["property", "leasing", "investment", "tower", "high-rise", "highrise"],
    },
    "informality": {
        "label": "Informality & Equity",
        "family": "shelter",
        "strong": [
            "informal settlement", "informal settlements", "slum dwellers", "slum demolition",
            "street vendors", "street vending", "hawkers", "informal economy",
            "informal workers", "gig workers", "migrant workers", "urban poor",
            "spatial inequality", "urban inequality", "displacement of residents",
            "forced eviction", "resettlement colony", "basti", "chawl", "favela",
            "right to the city", "urban exclusion", "segregation",
        ],
        "medium": [
            "slum", "slums", "shanty", "squatter", "encroachment", "encroachments",
            "daily wage", "domestic workers", "waste pickers", "rag pickers",
            "marginalised", "marginalized", "urban poverty", "caste discrimination",
            "accessibility for disabled", "disability access",
            "demolition drive", "demolition", "demolished", "bulldozer", "razed",
            "rehabilitation of residents", "relocation of residents",
        ],
        "weak": ["poverty", "inequality", "informal", "livelihood", "livelihoods"],
    },
    "transport": {
        "label": "Transport & Mobility",
        "family": "movement",
        "strong": [
            "public transport", "public transit", "mass transit", "metro rail",
            "bus rapid transit", "brts", "light rail", "tram", "suburban rail",
            "cycling infrastructure", "cycle lane", "bike lane", "bicycle lane",
            "pedestrianisation", "pedestrianization", "walkability", "footpath",
            "congestion pricing", "congestion charge", "low traffic neighbourhood",
            "transit-oriented development", "transit oriented", "last mile connectivity",
            "road safety", "vision zero", "traffic calming", "parking policy",
            "electric buses", "e-bus", "bus fleet", "ridership", "fare hike",
            "car-free", "car free", "15-minute city", "fifteen-minute city",
            "ride-hailing", "ride hailing", "micromobility", "e-scooter",
            "high-speed rail", "high speed rail", "bullet train", "rail corridor",
            "regional rail", "freight corridor", "intercity rail", "rail link",
        ],
        "medium": [
            "metro station", "metro line", "namma metro", "bmtc", "amts", "janmarg",
            "commuters", "commuting", "traffic congestion", "gridlock", "signal-free",
            "flyover", "underpass", "expressway", "highway project", "toll",
            "railway station", "airport expansion", "cab drivers", "auto rickshaw",
            "pedestrians", "cyclists", "electric vehicle", "ev charging",
        ],
        "weak": ["traffic", "transport", "mobility", "buses", "metro", "railways", "parking"],
    },
    "infrastructure": {
        "label": "Infrastructure & Utilities",
        "family": "movement",
        "strong": [
            "infrastructure project", "infrastructure spending", "capital works",
            "power grid", "electricity grid", "grid failure", "load shedding",
            "power outage", "blackout", "district cooling", "district heating",
            "solid waste management", "waste management", "landfill", "sewer network",
            "stormwater drain", "drainage system", "utility bill", "utility rates",
            "broadband rollout", "fibre optic", "telecom infrastructure",
            "bridge collapse", "road repair", "potholes", "street lighting",
        ],
        "medium": [
            "sewage", "sewerage", "drainage", "electricity supply", "power supply",
            "waste collection", "garbage collection", "solid waste", "recycling plant",
            "substation", "pipeline", "public works", "civic infrastructure",
            "maintenance backlog", "municipal budget", "pothole", "road widening",
            "civic works", "civic amenities", "water supply line", "tender awarded",
        ],
        "weak": ["infrastructure", "utilities", "grid", "sewer", "waste", "roads"],
    },
    "climate": {
        "label": "Climate & Resilience",
        "family": "environment",
        "strong": [
            "climate resilience", "climate adaptation", "climate mitigation",
            "climate action plan", "net zero", "net-zero", "carbon neutral",
            "urban heat island", "heat action plan", "heatwave", "heat wave",
            "extreme heat", "cooling centre", "cooling center",
            "urban flooding", "flash flood", "flood risk", "flood defence",
            "sea level rise", "coastal erosion", "storm surge", "cyclone",
            "climate finance", "climate justice", "emissions reduction",
            "green building", "energy efficiency", "retrofit", "rooftop solar",
            "sponge city", "nature-based solutions", "disaster preparedness",
        ],
        "medium": [
            "carbon emissions", "greenhouse gas", "decarbonisation", "decarbonization",
            "renewable energy", "solar power", "wind power", "resilience plan",
            "monsoon flooding", "waterlogging", "drought", "wildfire", "urban heat",
            "cop29", "cop30", "cop31", "paris agreement", "climate summit",
        ],
        "weak": ["climate", "emissions", "flooding", "floods", "sustainability", "resilience"],
    },
    "air": {
        "label": "Air Quality & Pollution",
        "family": "environment",
        "strong": [
            "air quality index", "air pollution", "air quality", "pm2.5", "pm 2.5", "pm10",
            "particulate matter", "smog", "clean air act", "clean air zone",
            "low emission zone", "ultra low emission", "emission norms",
            "stubble burning", "vehicular emissions", "industrial emissions",
            "noise pollution", "graded response action plan", "grap",
        ],
        "medium": [
            "pollution levels", "pollution control board", "aqi", "toxic air",
            "dust pollution", "construction dust", "smoke", "air pollutants",
        ],
        "weak": ["pollution", "polluted", "emissions standards"],
    },
    "water": {
        "label": "Water & Sanitation",
        "family": "environment",
        "strong": [
            "water supply", "water scarcity", "water crisis", "water shortage",
            "drinking water", "piped water", "water tanker", "groundwater depletion",
            "borewell", "rainwater harvesting", "water table", "aquifer",
            "wastewater treatment", "sewage treatment plant", "open defecation",
            "public toilets", "sanitation workers", "manual scavenging",
            "lake encroachment", "lake restoration", "river pollution",
            "river rejuvenation", "riverfront", "water body", "water bodies",
        ],
        "medium": [
            "water board", "water tariff", "water bill", "desalination",
            "reservoir", "dam water", "sanitation", "sewage discharge",
            "wetland", "wetlands", "stormwater", "storm water", "canal",
            "waterlogged", "waterlogging", "water logging", "desilting",
            "drain cleaning", "clogged drains", "flooded streets",
        ],
        "weak": ["water", "lakes", "rivers", "toilets", "drains"],
    },
    "ecology": {
        "label": "Urban Ecology & Biodiversity",
        "family": "environment",
        "strong": [
            "urban forest", "urban forestry", "tree cover", "tree canopy",
            "tree felling", "tree cutting", "deforestation", "afforestation",
            "green cover", "green belt", "biodiversity loss", "urban biodiversity",
            "urban wildlife", "human-wildlife conflict", "wildlife corridor",
            "ecological restoration", "miyawaki", "urban farming", "urban agriculture",
            "community garden", "rewilding", "pollinators",
        ],
        "medium": [
            "biodiversity", "ecology", "green space", "urban greening",
            "native species", "invasive species", "habitat loss",
            "birdlife", "leopard", "conservation area",
        ],
        "weak": ["trees", "forest", "wildlife", "nature", "gardens"],
    },
    "governance": {
        "label": "Governance & Policy",
        "family": "society",
        "strong": [
            "urban governance", "municipal corporation", "municipal council",
            "city council", "city government", "local government", "local body",
            "mayor", "municipal commissioner", "urban local body", "civic body",
            "master plan", "development plan", "city plan", "comprehensive plan",
            "zoning code", "zoning reform", "building bylaws", "building code",
            "planning permission", "planning application", "development control",
            "smart cities mission", "amrut", "urban policy", "urban reform",
            "decentralisation", "decentralization", "74th amendment",
            "participatory budgeting", "civic participation", "ward committee",
            "public consultation", "right to information", "urban budget",
        ],
        "medium": [
            "bbmp", "amc", "bmc", "municipality", "corporator", "councillor",
            "town planning", "urban development department", "planning authority",
            "auda", "bda", "bmrda", "governance reform", "public hearing",
            "state government", "policy framework", "regulation", "civic elections",
            "civic issues", "civic agency", "development authority", "town hall",
            "high court asks", "tribunal", "notified area", "gazette notification",
        ],
        "weak": ["planning", "policy", "governance", "council", "civic", "municipal"],
    },
    "publicspace": {
        "label": "Public Space & Placemaking",
        "family": "society",
        "strong": [
            "public space", "public spaces", "public realm", "placemaking",
            "urban design", "streetscape", "public plaza", "town square",
            "park redevelopment", "urban park", "city park", "playground",
            "waterfront development", "promenade", "open space", "open spaces",
            "pedestrian plaza", "shared street", "complete streets",
            "tactical urbanism", "street furniture", "public art",
            "night-time economy", "third place",
        ],
        "medium": [
            "public park", "parks", "plaza", "square", "greenway", "boulevard",
            "civic space", "community space", "public seating", "urban renewal",
            "regeneration", "beautification", "busking", "street performers",
            "opens its streets", "footpath encroachment", "pedestrian crossing",
        ],
        "weak": ["park", "street design", "sidewalk", "pavement", "streets", "footpaths"],
    },
    "health": {
        "label": "Public Health",
        "family": "society",
        "strong": [
            "public health", "urban health", "health infrastructure",
            "primary health centre", "hospital capacity", "healthcare access",
            "disease outbreak", "epidemic", "pandemic", "vector-borne",
            "dengue outbreak", "malaria cases", "cholera", "food safety",
            "mental health services", "heat-related deaths", "heat deaths",
            "road traffic deaths", "life expectancy gap", "health inequality",
        ],
        "medium": [
            "hospitals", "clinics", "dengue", "malaria", "chikungunya",
            "vaccination drive", "healthcare workers", "sanitary conditions",
            "urban health mission", "nutrition", "obesity", "air quality health",
        ],
        "weak": ["disease", "hospital"],
    },
    "culture": {
        "label": "Urban Culture & Nightlife",
        "family": "society",
        "strong": [
            "night-time economy", "nightlife", "night life", "cultural district",
            "creative economy", "creative industries", "cultural policy",
            "street food culture", "food street", "public festival",
            "city festival", "arts district", "music venue", "live music venue",
            "community festival", "cultural infrastructure", "public library",
            "civic pride", "city identity", "urban imagination",
        ],
        "medium": [
            "museum opening", "art gallery", "theatre district", "cultural centre",
            "cultural center", "pub", "bars", "restaurants scene", "street art",
            "mural", "graffiti", "community centre", "community center",
            "busking", "street performance", "street performers", "public event",
        ],
        "weak": ["culture", "festival", "nightlife scene", "arts"],
    },
    "architecture": {
        "label": "Architecture & Design",
        "family": "design",
        "strong": [
            "architecture firm", "architectural design", "architects",
            "pritzker prize", "riba", "design competition", "competition winner",
            "adaptive reuse", "mass timber", "modular construction",
            "prefabricated", "passive design", "vernacular architecture",
            "building design", "facade design", "housing design",
            "interior architecture", "landscape architecture", "urban form",
        ],
        "medium": [
            "architect", "architecture", "studio", "pavilion", "biennale",
            "design studio", "renovation", "restoration project", "new building",
            "skyscraper", "residential tower", "campus design", "design brief",
        ],
        "weak": ["design", "building", "construction", "structure"],
    },
    "heritage": {
        "label": "Heritage & Conservation",
        "family": "design",
        "strong": [
            "heritage conservation", "heritage building", "heritage site",
            "world heritage", "unesco", "listed building", "conservation area",
            "historic preservation", "historic district", "archaeological site",
            "monument protection", "heritage walk", "heritage precinct",
            "restoration of monument", "old city", "walled city",
            "intangible heritage", "heritage bylaws",
        ],
        "medium": [
            "heritage", "conservation", "monument", "monuments", "historic",
            "archaeological survey", "asi", "pol houses", "haveli", "stepwell",
            "fort", "temple restoration", "colonial architecture",
        ],
        "weak": ["preservation", "ancient", "legacy building"],
    },
    "smartcity": {
        "label": "Smart Cities & Urban Tech",
        "family": "tech",
        "strong": [
            "smart city", "smart cities", "urban technology", "urban tech",
            "digital twin", "iot sensors", "sensor network", "command centre",
            "command center", "integrated command", "surveillance cameras",
            "facial recognition", "cctv network", "predictive policing",
            "autonomous vehicles", "self-driving", "drone delivery",
            "digital infrastructure", "e-governance", "civic tech",
            "artificial intelligence in cities", "algorithmic governance",
        ],
        "medium": [
            "smart meter", "smart grid", "sensors", "automation", "digitalisation",
            "digitalization", "urban innovation", "govtech", "platform economy",
            "data centre", "data center", "5g rollout",
        ],
        "weak": ["technology", "digital", "app", "artificial intelligence"],
    },
    "data": {
        "label": "Data & Mapping",
        "family": "tech",
        "strong": [
            "open data", "urban data", "city data", "census data", "geospatial",
            "gis mapping", "satellite imagery", "remote sensing", "open street map",
            "openstreetmap", "data dashboard", "urban analytics", "spatial analysis",
            "mobility data", "population data", "urban indicators", "city index",
            "data privacy", "data governance",
        ],
        "medium": [
            "mapping", "dataset", "survey findings", "index ranking",
            "ranking of cities", "visualisation", "visualization",
        ],
        # 'report', 'analysis' and 'research' appear in almost every long-form
        # article ever written and tagged unrelated essays as Data & Mapping.
        "weak": ["data", "statistics"],
    },
}

# --- Urban context ------------------------------------------------------
# These do not name a theme, they establish that the story is set in a city.
# Scored separately so that "pollution" in a story about farmland does not
# masquerade as urban news.

URBAN_CONTEXT_STRONG = [
    # generic city words
    "city", "urban", "municipal", "metropolitan", "metro area",
    "neighbourhood", "neighborhood", "downtown", "civic", "township",
    "urbanisation", "urbanization", "city centre", "city center",
    "resident", "citizen", "commuter", "locality", "ward",
    "suburb", "suburban", "peri-urban", "town",
    # domain phrases that imply a city even when no city word appears.
    # Needed because a Guardian piece on the affordable-housing crisis is
    # plainly urban without ever using the word "city" — while "public health"
    # and "infrastructure spending" are not, which is why this list is
    # curated separately rather than reusing the themes' strong tiers.
    "urban planning", "town planning", "master plan", "zoning",
    "affordable housing", "public housing", "housing crisis", "homelessness",
    "public transport", "public transit", "mass transit", "metro rail",
    "bus rapid transit", "transit-oriented", "congestion pricing",
    "walkability", "streetscape", "placemaking", "public space",
    "smart city", "slum", "informal settlement", "gentrification",
    "urban heat island", "municipal corporation", "city council", "mayor",
    "land use", "urban renewal", "civic body", "property market",
    "footpath", "sidewalk", "cycle lane", "bike lane", "pedestrian",
    "high-rise", "skyline", "built environment", "public realm",
]

# --- Noise --------------------------------------------------------------
# Subtracted from urban_score. Kills the sport, celebrity and crime-blotter
# items that flood general city feeds, plus wire-service filler.

NOISE = [
    # sport
    "cricket", "ipl", "wicket", "batsman", "bowler", "test match", "odi ",
    "premier league", "football match", "fifa", "nba", "nfl", "olympics medal",
    # entertainment
    "box office", "bollywood", "hollywood", "actor", "actress", "film review",
    "movie review", "web series", "netflix", "celebrity", "horoscope",
    "astrology", "zodiac", "recipe", "beauty tips", "weight loss",
    # crime blotter — the single biggest source of false positives in Indian
    # city feeds, where "slum", "layout" and "corporation" appear constantly in
    # stories that have nothing to do with how the city is built or run
    "murder", "rape", "molested", "molestation", "kidnapped", "abducted",
    "gangster", "smuggling", "assaulted", "assault", "arrested", "stabbed",
    "shot dead", "chargesheet", "custody", "granted bail", "hoax", "extortion",
    "swindle", "forgery", "cheating case", "drug bust", "liquor seized",
    "suicide", "bomb threat", "held for", "booked for",
    # markets
    "sensex", "nifty", "stock market", "share price", "quarterly results",
    "ipo ", "cryptocurrency", "bitcoin",
    # filler
    "wedding", "birthday", "obituary", "viral video", "trending on",
    "live updates", "in pics", "watch video", "quiz", "horoscope today",
]

# --- City hints ---------------------------------------------------------
# Lets a story from a national feed be promoted into a city tier. Proper names
# score 3, secondary markers 1; a total of 3+ promotes.

CITY_HINTS = {
    "ahmedabad": {
        3: ["ahmedabad", "amdavad"],
        1: [
            "sabarmati", "gandhinagar", "auda", "gujarat", "bopal", "maninagar",
            "vastrapur", "satellite road", "sg highway", "naroda", "bhadra",
            "kankaria", "amts", "janmarg", "gift city", "ahmedabad municipal",
        ],
    },
    "bengaluru": {
        3: ["bengaluru", "bangalore"],
        1: [
            "bbmp", "bmrcl", "namma metro", "bmtc", "whitefield", "koramangala",
            "indiranagar", "electronic city", "hebbal", "yelahanka", "jayanagar",
            "malleswaram", "hsr layout", "bellandur", "outer ring road",
            "karnataka", "bda ", "silicon valley of india", "cubbon park",
        ],
    },
}

# --- Compiled matchers --------------------------------------------------


def _compile(words):
    """One alternation regex per word list. Word-boundary anchored so that
    'ev charging' does not match inside 'seven charging' and 'amc' does not
    match inside 'dynamic'.

    A trailing (?:e?s)? absorbs plurals. Without it every singular phrase in the
    lexicon is blind to its own plural — 'data center' silently fails to match
    'data centers', which is how a whole theme quietly under-reports.
    """
    if not words:
        return None
    parts = sorted((re.escape(w.strip()) for w in words if w.strip()), key=len, reverse=True)
    return re.compile(r"\b(?:" + "|".join(parts) + r")(?:e?s)?\b", re.IGNORECASE)


_THEME_MATCHERS = {
    tid: {
        "strong": _compile(t.get("strong", [])),
        "medium": _compile(t.get("medium", [])),
        "weak": _compile(t.get("weak", [])),
    }
    for tid, t in THEMES.items()
}
_CONTEXT_MATCHER = _compile(URBAN_CONTEXT_STRONG)
_NOISE_MATCHER = _compile(NOISE)
_CITY_MATCHERS = {
    city: {w: _compile(words) for w, words in tiers.items()}
    for city, tiers in CITY_HINTS.items()
}

_WEIGHTS = {"strong": 3, "medium": 2, "weak": 1}


def _distinct_hits(matcher, text):
    """Count distinct matched terms, not total occurrences. A headline that says
    'housing' six times is not six times more about housing."""
    if matcher is None:
        return 0
    return len({m.lower() for m in matcher.findall(text)})


TITLE_BONUS = 2


def analyse(title, summary=""):
    """Score one article. Returns themes, urban score, and the two signals the
    caller needs to judge whether this is city news at all.

    'context' counts explicit city words. 'strong' counts unambiguously urban
    phrases. Both matter because a long feature can accumulate enough weak
    thematic hits to clear any numeric threshold while being about nothing
    urban whatsoever — an essay mentioning 'health', 'data' and 'research'
    should not read as urbanism just because it is long.
    """
    text = title + " . " + summary
    themes = {}
    strong_hits = 0

    for tid, matchers in _THEME_MATCHERS.items():
        strong = _distinct_hits(matchers["strong"], text)
        strong_hits += strong
        total = (
            strong * _WEIGHTS["strong"]
            + _distinct_hits(matchers["medium"], text) * _WEIGHTS["medium"]
            + _distinct_hits(matchers["weak"], text) * _WEIGHTS["weak"]
        )
        if total:
            # A hit in the headline earns a bonus. Many Indian city desks
            # publish no description at all, so the headline is the entire
            # signal; without this the thresholds are unreachable for them.
            if _distinct_hits(matchers["strong"], title) or _distinct_hits(
                matchers["medium"], title
            ):
                total += TITLE_BONUS
        if total >= 2:
            themes[tid] = total

    context = min(_distinct_hits(_CONTEXT_MATCHER, text), 3) * 2
    thematic = min(sum(themes.values()), 12)
    noise = _distinct_hits(_NOISE_MATCHER, text) * 4

    # Headline-level signal, kept separate. A long essay will eventually brush
    # against a context word somewhere in its summary; what distinguishes real
    # city coverage is that the headline itself announces it.
    title_context = _distinct_hits(_CONTEXT_MATCHER, title)
    title_strong = sum(
        _distinct_hits(m["strong"], title) for m in _THEME_MATCHERS.values()
    )

    return {
        "themes": themes,
        "urban": context + thematic - noise,
        "context": context,
        "strong": strong_hits,
        "titleSignal": title_context + title_strong,
    }


def detect_city(text):
    """Return 'ahmedabad' | 'bengaluru' | None for tier promotion."""
    best, best_score = None, 0
    for city, tiers in _CITY_MATCHERS.items():
        score = sum(_distinct_hits(m, text) * w for w, m in tiers.items())
        if score >= 3 and score > best_score:
            best, best_score = city, score
    return best


def theme_meta():
    """Flat theme metadata for the front end."""
    return {
        tid: {"label": t["label"], "family": t["family"]}
        for tid, t in THEMES.items()
    }
