import re
import time
import html
from urllib.parse import quote_plus, urlparse
import requests
import feedparser
from .config import get_settings

settings = get_settings()
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": settings.user_agent, "Accept": "application/json,text/html,*/*"})

BUYER_INDUSTRIES = {
    "web development": ["retail shops", "restaurants and cafes", "clinics", "hotels", "real estate offices", "schools", "fitness centres"],
    "software development": ["retail shops", "logistics and transport businesses", "clinics", "schools", "hotels", "professional offices"],
    "mobile app development": ["restaurants and cafes", "hotels", "fitness centres", "retail shops", "schools", "transport businesses"],
    "digital marketing": ["retail shops", "restaurants and cafes", "clinics", "hotels", "real estate offices", "fitness centres", "schools"],
    "seo": ["retail shops", "restaurants and cafes", "clinics", "hotels", "real estate offices", "professional offices"],
    "graphic design": ["retail shops", "restaurants and cafes", "hotels", "real estate offices", "fitness centres", "schools"],
    "video editing": ["hotels", "restaurants and cafes", "fitness centres", "real estate offices", "tourism businesses", "schools"],
    "social media marketing": ["retail shops", "restaurants and cafes", "clinics", "hotels", "real estate offices", "fitness centres", "schools"],
}

def buyer_industries(skill: str) -> list[str]:
    normalized = skill.lower().strip()
    for key, sectors in BUYER_INDUSTRIES.items():
        if key in normalized or normalized in key:
            return sectors
    return ["retail shops", "restaurants and cafes", "professional offices", "clinics", "hotels", "schools", "real estate offices"]

def _osm_category(tags: dict) -> str:
    for key in ("shop", "office", "amenity", "tourism", "leisure", "craft"):
        if tags.get(key):
            return f"{key}: {tags[key]}"
    return "Business / place"

def _business_from_osm(element: dict, country: str, city: str | None) -> dict | None:
    tags = element.get("tags") or {}
    name = (tags.get("name") or tags.get("name:en") or "").strip()
    if len(name) < 2:
        return None
    osm_type = str(element.get("type") or "node")
    osm_id = element.get("id")
    source_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"
    website = tags.get("website") or tags.get("contact:website") or tags.get("url")
    lat = element.get("lat") or (element.get("center") or {}).get("lat")
    lon = element.get("lon") or (element.get("center") or {}).get("lon")
    address_parts = [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:suburb"),
                     tags.get("addr:city") or city, tags.get("addr:state"), tags.get("addr:postcode"),
                     tags.get("addr:country") or country]
    address = ", ".join(str(x) for x in address_parts if x)
    return {
        "business_name": name,
        "website_url": website,
        "public_email": tags.get("email") or tags.get("contact:email"),
        "public_phone": tags.get("phone") or tags.get("contact:phone"),
        "country": tags.get("addr:country") or country,
        "city": tags.get("addr:city") or city,
        "category": _osm_category(tags),
        "source_name": "OpenStreetMap / Overpass",
        "source_url": source_url,
        "address": address,
        "latitude": str(lat) if lat is not None else None,
        "longitude": str(lon) if lon is not None else None,
        "lead_score": 0,
        "verification_status": "unverified",
        "evidence_note": "Business/place listing only. Actual demand for the requested skill must be assessed from public evidence."
    }

def search_businesses(skill: str, country: str, city: str | None, limit: int = 100) -> dict:
    sectors = buyer_industries(skill)
    found: dict[str, dict] = {}
    notes = []
    provider = "openstreetmap-overpass"
    area = ", ".join(x for x in [city, country] if x)
    if city:
        try:
            geo = SESSION.get("https://nominatim.openstreetmap.org/search",
                              params={"q": area, "format": "jsonv2", "limit": 1},
                              timeout=12)
            geo.raise_for_status()
            places = geo.json()
            if places:
                south, north, west, east = [float(x) for x in places[0]["boundingbox"]]
                bbox = f"{south},{west},{north},{east}"
                query = f"""[out:json][timeout:25];
(
  nwr["name"]["shop"]({bbox});
  nwr["name"]["office"]({bbox});
  nwr["name"]["amenity"~"restaurant|cafe|fast_food|clinic|hospital|school|university|bank|pharmacy|marketplace|fuel"]({bbox});
  nwr["name"]["tourism"~"hotel|guest_house|museum|attraction"]({bbox});
  nwr["name"]["leisure"~"fitness_centre|sports_centre"]({bbox});
  nwr["name"]["craft"]({bbox});
);
out center tags {min(1000, max(150, limit * 8))};
"""
                overpass = SESSION.post("https://overpass-api.de/api/interpreter",
                                        data={"data": query}, timeout=(8, 35))
                overpass.raise_for_status()
                elements = overpass.json().get("elements", [])
                for element in elements:
                    item = _business_from_osm(element, country, city)
                    if item:
                        found[item["source_url"]] = item
                    if len(found) >= limit:
                        break
            else:
                notes.append("City could not be geocoded for the Overpass buyer search.")
        except (requests.RequestException, ValueError, KeyError, IndexError) as exc:
            notes.append(f"Overpass city search unavailable: {type(exc).__name__}.")
    if not found:
        provider = "openstreetmap-nominatim-fallback"
        for index, term in enumerate(sectors[:7]):
            if index:
                time.sleep(1.1)
            try:
                response = SESSION.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": f"{term}, {area}", "format": "jsonv2", "addressdetails": 1,
                            "extratags": 1, "namedetails": 1, "limit": min(30, limit)},
                    timeout=15,
                )
                response.raise_for_status()
                for item in response.json():
                    name = (item.get("name") or item.get("namedetails", {}).get("name") or "").strip()
                    osm_type, osm_id = item.get("osm_type"), item.get("osm_id")
                    if len(name) < 2 or not osm_type or not osm_id:
                        continue
                    source_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"
                    tags = item.get("extratags") or {}
                    address = item.get("display_name", "")
                    found[source_url] = {
                        "business_name": name,
                        "website_url": tags.get("website") or tags.get("contact:website"),
                        "public_email": tags.get("email") or tags.get("contact:email"),
                        "public_phone": tags.get("phone") or tags.get("contact:phone"),
                        "country": (item.get("address") or {}).get("country", country),
                        "city": (item.get("address") or {}).get("city") or city,
                        "category": item.get("type") or item.get("class") or "Business / place",
                        "source_name": "OpenStreetMap / Nominatim fallback",
                        "source_url": source_url, "address": address,
                        "latitude": item.get("lat"), "longitude": item.get("lon"),
                        "lead_score": 0, "verification_status": "unverified",
                        "evidence_note": "Buyer-industry listing only; skill demand is not confirmed."
                    }
                    if len(found) >= limit:
                        break
            except requests.RequestException as exc:
                notes.append(f"Buyer-industry lookup failed: {type(exc).__name__}.")
            if len(found) >= limit:
                break
    results = list(found.values())[:limit]
    return {
        "provider": provider,
        "providerLabel": "OpenStreetMap buyer-industry candidates",
        "searchedCount": len(sectors),
        "results": results,
        "partial": len(results) < limit,
        "partialError": "; ".join(notes) or ("Public map coverage returned fewer candidates than requested." if len(results) < limit else ""),
        "queries": sectors,
        "providerNote": "Search targets businesses that may buy the requested skill, not agencies selling that same service. AI must inspect each candidate before calling it an opportunity. Coverage varies by city and public map data."
    }

def _clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return html.unescape(re.sub(r"\s+", " ", value)).strip()

def search_social(skill: str, country: str, city: str | None, limit: int = 100) -> dict:
    area = city or country
    phrases = [f'"need a {skill}"', f'"looking for {skill}"', f'"hire a {skill}"', f'"{skill} project"', f'"{skill} required"']
    domains = ["linkedin.com/posts", "facebook.com", "instagram.com", "x.com", "reddit.com"]
    results: dict[str, dict] = {}
    errors = []
    queries = [f"{phrase} {area} site:{domain}" for phrase in phrases[:3] for domain in domains]
    for query in queries:
        if len(results) >= limit:
            break
        try:
            url = "https://news.google.com/rss/search?q=" + quote_plus(query) + "&hl=en&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
            for entry in feed.entries:
                link = getattr(entry, "link", "")
                if not link or link in results:
                    continue
                results[link] = {"platform": _platform(link), "post_url": link, "author_name": getattr(entry, "source", {}).get("title") if isinstance(getattr(entry, "source", {}), dict) else None, "post_text": _clean(getattr(entry, "title", "")) + " — " + _clean(getattr(entry, "summary", "")), "posted_at": getattr(entry, "published", None), "country": country, "city": city, "requested_service": skill, "budget_text": None, "urgency": "unknown", "buying_intent": "possible" if any(word in query.lower() for word in ["need", "looking", "hire"]) else "unverified", "lead_score": 0, "score_reason": "Publicly indexed search result; inspect original page to confirm intent.", "verification_status": "unverified", "source_name": "Google News RSS index"}
                if len(results) >= limit:
                    break
        except Exception as exc:
            errors.append(type(exc).__name__)
        time.sleep(0.15)
    # Remotive is a public jobs feed; include actual job listings, not mislabeled social posts.
    try:
        job_response = SESSION.get("https://remotive.com/api/remote-jobs", params={"search": skill, "limit": min(20, limit)}, timeout=15)
        job_response.raise_for_status()
        for job in job_response.json().get("jobs", []):
            link = job.get("url")
            if link and link not in results:
                results[link] = {"platform": "Remote jobs", "post_url": link, "author_name": job.get("company_name"), "post_text": _clean(job.get("title", "")) + " — " + _clean(job.get("description", ""))[:1200], "posted_at": job.get("publication_date"), "country": country, "city": city, "requested_service": skill, "budget_text": None, "urgency": "unknown", "buying_intent": "hiring", "lead_score": 0, "score_reason": "Job listing from Remotive; employment opportunity, not necessarily a freelance client lead.", "verification_status": "unverified", "source_name": "Remotive public jobs API"}
    except requests.RequestException as exc:
        errors.append(type(exc).__name__)
    rows = list(results.values())[:limit]
    return {"provider": "public-rss", "providerLabel": "Public indexed RSS + job feeds", "searchedCount": len(queries), "results": rows, "partial": len(rows) < limit, "partialError": "; ".join(errors) or ("Public sources returned fewer results than requested." if len(rows) < limit else ""), "queries": queries, "providerNote": "Social results are Google News-indexed public pages, not direct platform APIs. Job listings are labeled separately; private content is never accessed."}

def _platform(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "linkedin" in host: return "LinkedIn"
    if "facebook" in host: return "Facebook"
    if "instagram" in host: return "Instagram"
    if "twitter" in host or "x.com" in host: return "X"
    if "reddit" in host: return "Reddit"
    if "threads" in host: return "Threads"
    return "Public web"
