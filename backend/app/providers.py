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

SKILL_TERMS = {
    "web development": ["web developer", "website development", "web design agency", "website redesign", "ecommerce website"],
    "software development": ["software developer", "software company", "custom software", "app development"],
    "digital marketing": ["digital marketing agency", "SEO agency", "social media marketing", "online advertising"],
    "graphic design": ["graphic designer", "branding agency", "logo design", "creative studio"],
    "video editing": ["video production", "video editor", "content studio", "video marketing"],
}

def skill_queries(skill: str) -> list[str]:
    normalized = skill.lower().strip()
    for key, terms in SKILL_TERMS.items():
        if key in normalized or normalized in key:
            return terms
    base = skill.strip()
    return [base, f"{base} services", f"{base} agency", f"business needing {base}", f"{base} company"]

def search_businesses(skill: str, country: str, city: str | None, limit: int = 100) -> dict:
    area = ", ".join(x for x in [city, country] if x)
    found: dict[str, dict] = {}
    queries = skill_queries(skill)[:5]
    notes = []
    for index, term in enumerate(queries):
        if index:
            time.sleep(1.1)  # Respect the public Nominatim service's low-volume policy.
        try:
            response = SESSION.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": f"{term}, {area}", "format": "jsonv2", "addressdetails": 1, "extratags": 1, "namedetails": 1, "limit": min(50, limit)},
                timeout=18,
            )
            response.raise_for_status()
            for item in response.json():
                name = (item.get("name") or item.get("namedetails", {}).get("name") or "").strip()
                if len(name) < 2:
                    continue
                osm_type, osm_id = item.get("osm_type"), item.get("osm_id")
                source_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}" if osm_type and osm_id else item.get("display_name", "")
                address = item.get("address") or {}
                website = (item.get("extratags") or {}).get("website") or (item.get("extratags") or {}).get("contact:website")
                found[source_url] = {
                    "business_name": name,
                    "website_url": website,
                    "country": address.get("country", country),
                    "city": address.get("city") or address.get("town") or address.get("village") or city,
                    "category": item.get("type") or item.get("class") or "Business / place",
                    "source_name": "OpenStreetMap / Nominatim",
                    "source_url": source_url,
                    "address": item.get("display_name", ""),
                    "latitude": item.get("lat"), "longitude": item.get("lon"),
                    "lead_score": 0, "verification_status": "unverified",
                    "evidence_note": "Public map listing; business identity and website ownership require review."
                }
                if len(found) >= limit:
                    break
        except requests.RequestException as exc:
            notes.append(f"Nominatim query '{term}' failed: {type(exc).__name__}")
        if len(found) >= limit:
            break
    return {"provider": "openstreetmap", "providerLabel": "OpenStreetMap public data", "searchedCount": len(queries), "results": list(found.values())[:limit], "partial": len(found) < limit, "partialError": "; ".join(notes) or ("OpenStreetMap returned fewer matches than requested. Coverage varies by area." if len(found) < limit else ""), "queries": queries, "providerNote": "Free public map data; not Google Maps. Requests are deliberately rate-limited."}

def _clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return html.unescape(re.sub(r"\\s+", " ", value)).strip()

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
