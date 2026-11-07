import ipaddress
import json
import socket
import time
from html.parser import HTMLParser
from urllib.parse import quote_plus, urljoin, urlparse

import feedparser
import requests
from google import genai

from .config import get_settings

settings = get_settings()
HEADERS = {
    "User-Agent": "GlobalLeadAI/1.0 (+https://global-lead-ai.vercel.app; public website audit)",
    "Accept": "text/html,application/xhtml+xml,application/rss+xml;q=0.9,*/*;q=0.5",
}

class PageFacts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.description = ""
        self.viewport = False
        self.h1 = []
        self.text = []
        self.images = 0
        self.images_alt = 0
        self.links = []
        self.canonical = None
        self._title = False
        self._h1 = False
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag == "title":
            self._title = True
        if tag == "h1":
            self._h1 = True
        if tag == "meta":
            name = (a.get("name") or "").lower()
            if name == "description":
                self.description = (a.get("content") or "")[:350]
            if name == "viewport":
                self.viewport = True
        if tag == "link" and (a.get("rel") or "").lower() == "canonical":
            self.canonical = a.get("href")
        if tag == "img":
            self.images += 1
            if "alt" in a:
                self.images_alt += 1
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1
        if tag == "title":
            self._title = False
        if tag == "h1":
            self._h1 = False

    def handle_data(self, data):
        value = " ".join((data or "").split())
        if not value:
            return
        if self._title:
            self.title += " " + value
        if self._h1:
            self.h1.append(value)
        if not self._skip and len(self.text) < 1200:
            self.text.append(value)

def _public_url(raw):
    try:
        url = urlparse(raw.strip())
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            return None
        host = url.hostname.lower()
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            return None
        addresses = socket.getaddrinfo(host, url.port or (443 if url.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addresses:
            return None
        for item in addresses:
            ip = ipaddress.ip_address(item[4][0])
            if not ip.is_global:
                return None
        return url
    except (ValueError, OSError):
        return None

def audit_website(raw_url):
    if not raw_url:
        return {"status": "missing", "httpStatus": None, "finalUrl": None, "pageLoadMs": None,
                "mobileResponsive": None, "title": None, "metaDescription": None,
                "seoIssues": ["No official website URL was supplied by the business listing."],
                "pageText": "", "socialLinks": [], "htmlChecked": False}
    current = raw_url.strip()
    started = time.monotonic()
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        response = None
        for _ in range(4):
            if not _public_url(current):
                return {"status": "blocked", "httpStatus": None, "finalUrl": None, "pageLoadMs": None,
                        "mobileResponsive": None, "title": None, "metaDescription": None,
                        "seoIssues": ["Website address or redirect was not a safe public HTTP/HTTPS destination."],
                        "pageText": "", "socialLinks": [], "htmlChecked": False}
            response = session.get(current, timeout=(4, 8), allow_redirects=False, stream=True)
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("location")
                if not location:
                    break
                current = urljoin(current, location)
                response.close()
                continue
            break
        elapsed = round((time.monotonic() - started) * 1000)
        if response is None:
            raise requests.RequestException("No HTTP response")
        if response.status_code >= 400:
            return {"status": "http_error", "httpStatus": response.status_code, "finalUrl": current,
                    "pageLoadMs": elapsed, "mobileResponsive": None, "title": None,
                    "metaDescription": None, "seoIssues": [f"Website returned HTTP {response.status_code}."],
                    "pageText": "", "socialLinks": [], "htmlChecked": False}
        ctype = response.headers.get("content-type", "").lower()
        if "text/html" not in ctype:
            return {"status": "working", "httpStatus": response.status_code, "finalUrl": current,
                    "pageLoadMs": elapsed, "mobileResponsive": None, "title": None,
                    "metaDescription": None, "seoIssues": ["Website responds, but its homepage is not HTML; page SEO was not assessed."],
                    "pageText": "", "socialLinks": [], "htmlChecked": False}
        chunks, total = [], 0
        for chunk in response.iter_content(16384):
            if not chunk:
                continue
            total += len(chunk)
            chunks.append(chunk)
            if total >= 400000:
                break
        response.close()
        raw = b"".join(chunks)[:400000]
        encoding = response.encoding or "utf-8"
        source = raw.decode(encoding, errors="replace")
        facts = PageFacts()
        facts.feed(source)
        title = " ".join(facts.title.split())[:180] or None
        description = facts.description or None
        issues = []
        if not title:
            issues.append("Homepage title tag is missing.")
        if not description:
            issues.append("Homepage meta description is missing.")
        if not facts.viewport:
            issues.append("Mobile viewport meta tag is missing.")
        if not facts.h1:
            issues.append("No H1 heading was found in the downloaded HTML.")
        if facts.images and facts.images_alt < facts.images:
            issues.append(f"{facts.images - facts.images_alt} of {facts.images} image tags have no alt attribute.")
        if len(" ".join(facts.text)) < 180:
            issues.append("Very little readable homepage text was available; the site may render content with JavaScript.")
        parsed_host = urlparse(current).hostname or ""
        social_hosts = ("facebook.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com")
        social_links = []
        for link in facts.links:
            absolute = urljoin(current, link)
            host = (urlparse(absolute).hostname or "").lower()
            if any(host == item or host.endswith("." + item) for item in social_hosts):
                if absolute not in social_links:
                    social_links.append(absolute)
        return {"status": "working", "httpStatus": response.status_code, "finalUrl": current,
                "pageLoadMs": elapsed, "mobileResponsive": facts.viewport, "title": title,
                "metaDescription": description, "h1": facts.h1[:5], "imageCount": facts.images,
                "imagesWithAlt": facts.images_alt, "seoIssues": issues, "pageText": " ".join(facts.text)[:7000],
                "socialLinks": social_links[:12], "htmlChecked": True}
    except requests.RequestException as exc:
        return {"status": "unreachable", "httpStatus": None, "finalUrl": current,
                "pageLoadMs": round((time.monotonic() - started) * 1000), "mobileResponsive": None,
                "title": None, "metaDescription": None,
                "seoIssues": [f"Website could not be checked: {type(exc).__name__}."],
                "pageText": "", "socialLinks": [], "htmlChecked": False}
    finally:
        session.close()

def search_public_evidence(business):
    name = str(business.get("business_name") or "").strip()
    location = " ".join(str(business.get(k) or "") for k in ("city", "country")).strip()
    if not name:
        return []
    query = quote_plus(f'"{name}" {location} business services')
    url = f"https://news.google.com/rss/search?q={query}&hl=en&gl=US&ceid=US:en"
    try:
        response = requests.get(url, headers=HEADERS, timeout=7)
        response.raise_for_status()
        feed = feedparser.parse(response.content)
        results = []
        for entry in feed.entries[:5]:
            link = getattr(entry, "link", None)
            title = getattr(entry, "title", None)
            summary = getattr(entry, "summary", "") or ""
            if link and title:
                results.append({"title": str(title)[:180], "url": str(link)[:500],
                                "content": " ".join(str(summary).split())[:700],
                                "source": "Google News public index"})
        return results
    except Exception:
        return []

def _clamp(value, low=0, high=100):
    try:
        return max(low, min(high, int(round(float(value)))))
    except (TypeError, ValueError):
        return low

def analyze_business(skill, business):
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is missing. Add a valid key to the Vercel project environment and redeploy.")
    audit = audit_website(business.get("website_url"))
    evidence = search_public_evidence(business)
    if audit.get("htmlChecked"):
        evidence.insert(0, {"title": audit.get("title") or business.get("business_name"),
                            "url": audit.get("finalUrl"), "content": audit.get("pageText", "")[:3500],
                            "source": "Fetched business homepage"})
    if business.get("source_url"):
        evidence.append({"title": "Original public business listing", "url": business["source_url"],
                         "content": str(business.get("address") or business.get("category") or ""),
                         "source": business.get("source_name") or "Business listing"})
    evidence = evidence[:7]
    prompt = f"""
You are a conservative B2B opportunity researcher. Determine whether this specific business has a defensible need for the user's skill.
Use only supplied evidence. Website technical issues can support a potential opportunity, but do NOT claim the owner wants to buy, has budget, or is actively searching unless evidence explicitly says so.
A missing website field is not proof the business has no website. A search result is not proof of business identity. Do not judge visual design because no screenshot is supplied. Separate observed facts from hypotheses.
Skill requested: {skill}
Business profile: {json.dumps({k: business.get(k) for k in ("business_name","website_url","category","city","country","address")}, ensure_ascii=False)}
Website audit facts: {json.dumps({k:v for k,v in audit.items() if k != "pageText"}, ensure_ascii=False)}
Public evidence: {json.dumps(evidence, ensure_ascii=False)}
Return valid JSON only with:
needScore (0-100), fitScore (0-100), confidence (0-1),
needLevel (strong_need|likely_opportunity|possible_opportunity|insufficient_evidence),
needReasons (array of max 4 evidence-backed short reasons),
identifiedGaps (array of max 5 specific gaps, do not invent),
recommendedService (one short service offer, or "Manual review required"),
summary (max 400 chars), evidenceIndexes (array of integer indexes into Public evidence).
Scoring: 80-100 only when there is explicit current buying/hiring evidence or multiple strong direct signals; 60-79 when several concrete service gaps are verified; 35-59 for one meaningful but indirect gap; 0-34 when evidence is weak or missing. fitScore measures how closely the business and evidence match the requested skill, not how likely it is to buy. If evidence is insufficient, say so clearly and keep confidence low.
"""
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0.2},
    )
    raw = response.text or "{}"
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        result = json.loads(raw[start:end + 1]) if start >= 0 and end > start else {}
    need = _clamp(result.get("needScore"))
    fit = _clamp(result.get("fitScore"))
    confidence = max(0.0, min(1.0, float(result.get("confidence") or 0)))
    if not evidence:
        need = min(need, 25)
        confidence = min(confidence, 0.2)
    elif not audit.get("htmlChecked") and len(evidence) < 2:
        need = min(need, 45)
        confidence = min(confidence, 0.4)
    level = result.get("needLevel")
    if need >= 80:
        level = "strong_need"
    elif need >= 60:
        level = "likely_opportunity"
    elif need >= 35:
        level = "possible_opportunity"
    else:
        level = "insufficient_evidence"
    quality = "missing" if audit["status"] == "missing" else "needs_improvement" if audit["status"] in ("http_error", "unreachable", "blocked") or audit["seoIssues"] else "good" if audit["htmlChecked"] else "unknown"
    gaps = [str(x)[:220] for x in result.get("identifiedGaps", []) if isinstance(x, str)][:5]
    for issue in audit["seoIssues"]:
        if issue not in gaps:
            gaps.append(issue)
    gaps = gaps[:5]
    reasons = [str(x)[:240] for x in result.get("needReasons", []) if isinstance(x, str)][:4]
    score = round(need * 0.75 + fit * 0.25)
    return {
        "status": "ok", "model": settings.gemini_model, "score": score,
        "needScore": need, "fitScore": fit, "confidence": round(confidence, 2),
        "needLevel": level, "needReasons": reasons,
        "scoreParts": {"businessNeed": need, "serviceFit": fit},
        "websiteQuality": quality, "identifiedGaps": gaps,
        "recommendedService": str(result.get("recommendedService") or "Manual review required")[:220],
        "evidenceSummary": str(result.get("summary") or "")[:400],
        "evidenceCount": len(evidence),
        "evidence": [{"title": x.get("title", "Public evidence"), "url": x.get("url"),
                      "content": x.get("content", "")[:800], "source": x.get("source", "Public web")} for x in evidence],
        "verificationStatus": "partially_verified" if audit.get("htmlChecked") or evidence else "unverified",
        "websiteAudit": {k:v for k,v in audit.items() if k != "pageText"},
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
