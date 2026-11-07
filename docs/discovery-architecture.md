# GlobalLead AI — Discovery Architecture

## Two independent discovery engines

### 1. Business discovery (Maps-first)

Flow:

`Skill + Country + optional City → Google Places Text Search → dedupe → business candidates → public website discovery → website audit → lead score`

- Supabase Edge Function: `maps-business-discovery`
- Preferred provider: Google Places API (New), Text Search.
- Free fallback: OpenStreetMap Nominatim + Overpass. The fallback requires a city and its coverage/contact fields can be incomplete.
- The business template generator has **77,760 possible combinations** (intent × sector × geography × query framing). A bounded set of five queries is selected for a search; the whole template space is not sent to the provider.
- The UI target is up to 100 listings. The provider may return fewer; no result count is guaranteed.
- Google Places Text Search is requested with Pro-tier fields only. Website URL and phone are deliberately not requested from the Enterprise tier. Public website candidates are looked up separately during enrichment.

### 2. Social opportunity discovery

Flow:

`Skill + Country + optional City → backend social query planner → public indexed search → source/domain validation → dedupe → opportunity scoring`

- Supabase Edge Function: `social-query-plan`
- Query planner capacity: **138,240 generated combinations** across buying intents, skill phrases, platforms, location phrases and query patterns.
- Each run selects a bounded batch (five to eight queries); it does not make 138,240 API calls.
- Search provider: Tavily public web index. Supported indexed domains include LinkedIn, Facebook, Instagram, X/Twitter and Threads.
- This is **not** a direct authenticated API integration for every social network. A post must be publicly indexed and available to the provider to appear. Private posts/accounts are not accessed.

## Website enrichment and audit

- Supabase Edge Function: `lead-enrich-score`
- Searches public indexed pages for a potential business website, then performs a bounded HTTP/HTML check.
- Saves HTTP availability, response time, viewport-meta detection, page title, meta description, H1/image-alt signals and basic technical SEO issues.
- A website found by public search is labelled a **potential website candidate** until the business identity/ownership is confirmed.
- A viewport meta tag is only a mobile-readiness signal; it does not prove full responsive behavior.
- No browser screenshot or Lighthouse run is performed, so visual design freshness and Core Web Vitals still require a dedicated browser audit/manual review.
- Lead score is transparent and includes website availability, mobile viewport, response time, basic SEO, evidence, public contact completeness, profile completeness, service fit and source corroboration.

## Provider configuration

All keys belong in Supabase Edge Function secrets, never in frontend code or GitHub:

- `GOOGLE_MAPS_API_KEY` — optional. Enables Google Places. Without it, business discovery uses OpenStreetMap and requires a city.
- `TAVILY_API_KEY` — public web/social indexing and website candidate discovery.
- `GEMINI_API_KEY` — AI evidence analysis.

Google Maps Platform requires a key and billing-enabled project and uses pay-as-you-go pricing. Check current pricing before enabling it. Restrict the key to Places API (New). The no-key OpenStreetMap fallback is intended for low/no-cost testing, subject to public service rate limits.

## Trust and safety rules

- Provider results are candidates, not verified clients.
- Never invent companies, posts, budgets, contact details, website ownership or buying intent.
- Keep source URLs and provider labels visible.
- Do not scrape private accounts, bypass logins, or auto-send outreach.
- Re-check the original post and public business evidence before contacting a lead.
