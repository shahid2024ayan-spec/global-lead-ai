import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function clean(value: unknown, max = 180): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
const BUSINESS_INTENTS = [
  "businesses with outdated websites", "companies needing a website redesign", "local businesses with no website",
  "businesses with broken or slow websites", "companies needing e-commerce development", "businesses seeking website maintenance",
  "small companies needing digital transformation", "businesses with weak mobile websites", "companies with poor search visibility",
  "businesses needing booking or ordering systems", "companies needing custom web applications", "businesses needing landing pages",
  "companies outsourcing digital services", "businesses looking for technology partners", "companies with incomplete online presence",
  "local companies needing professional service providers", "businesses needing automation", "companies needing a new digital platform",
];
const BUSINESS_SECTORS = [
  "restaurants", "cafes", "retail shops", "clothing stores", "medical clinics", "dental practices", "law firms",
  "accounting firms", "real estate agencies", "hotels", "travel agencies", "gyms", "beauty salons", "car dealerships",
  "auto repair shops", "education centers", "private schools", "construction companies", "manufacturers", "wholesalers",
  "logistics companies", "home service companies", "consultants", "local professional services",
  "startups", "software companies", "digital agencies", "marketing agencies", "small local companies", "independent businesses",
];
const BUSINESS_GEO_FORMS = ["in {area}", "near {area}", "serving {area}", "based around {area}", "in the {area} market", "around {area}", "across {area}", "located in {area}", "operating in {area}", "within {area}", "local to {area}", "in and around {area}"];
const BUSINESS_QUERY_FORMS = [
  "{intent} among {sector} {geo}", "{sector} {geo} that may need {skill}", "{intent} {geo} for {sector}",
  "{skill} opportunities: {sector} {geo}", "find prospects: {intent} {sector} {geo}", "{sector} with digital gaps {geo}",
  "potential {skill} clients: {sector} {geo}", "{sector} businesses with outdated online presence {geo}",
  "small and independent {sector} {geo}", "official {sector} listings {geo}", "{sector} that could benefit from {skill} {geo}",
  "business prospects for {skill} in {sector} {geo}",
];
const BUSINESS_TEMPLATE_LIBRARY_SIZE = BUSINESS_INTENTS.length * BUSINESS_SECTORS.length * BUSINESS_GEO_FORMS.length * BUSINESS_QUERY_FORMS.length;
function buildQueries(skill: string, area: string) {
  const output: string[] = [];
  const selected = [0, 1, 2, 3, 4];
  const sectorIndexes = [28, 24, 26, 0, 9];
  for (const index of selected) {
    const template = BUSINESS_QUERY_FORMS[index];
    const values = {
      intent: BUSINESS_INTENTS[(index * 3) % BUSINESS_INTENTS.length],
      sector: BUSINESS_SECTORS[sectorIndexes[index]],
      geo: BUSINESS_GEO_FORMS[(index * 2) % BUSINESS_GEO_FORMS.length].replaceAll("{area}", area),
      skill,
    };
    output.push(template.replace(/\{(intent|sector|geo|skill)\}/g, (_, key: keyof typeof values) => values[key]));
  }
  return output;
}
async function googlePlaces(skill: string, area: string, maxResults: number, apiKey: string) {
  const queries = buildQueries(skill, area);
  const found = new Map<string, Record<string, unknown>>();
  const errors: string[] = [];
  for (const query of queries) {
    let pageToken: string | undefined;
    for (let page = 0; page < 3 && found.size < maxResults; page++) {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.googleMapsUri,places.primaryTypeDisplayName,places.businessStatus,places.location,nextPageToken",
        },
        signal: AbortSignal.timeout(18000),
        body: JSON.stringify({
          textQuery: query,
          pageSize: 20,
          ...(pageToken ? { pageToken } : {}),
        }),
      });
      if (!response.ok) {
        const status = response.status;
        errors.push(status === 429 ? "Google Places quota/rate limit reached." : `Google Places returned HTTP ${status}.`);
        break;
      }
      const payload = await response.json();
      const places = Array.isArray(payload.places) ? payload.places : [];
      for (const place of places) {
        if (place.businessStatus === "CLOSED_PERMANENTLY") continue;
        const id = clean(place.id, 200);
        const name = clean(place.displayName?.text, 240);
        if (!id || !name || found.has(id)) continue;
        const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
        const country = components.find((part: any) => Array.isArray(part.types) && part.types.includes("country"))?.longText ?? null;
        const city = components.find((part: any) => Array.isArray(part.types) && (part.types.includes("locality") || part.types.includes("postal_town")))?.longText ?? null;
        found.set(id, {
          provider_id: id,
          business_name: name,
          address: clean(place.formattedAddress, 500),
          country: clean(country, 100),
          city: clean(city, 100),
          website_url: null,
          public_phone: null,
          category: clean(place.primaryTypeDisplayName?.text, 120) ?? skill,
          source_name: "Google Maps / Places",
          source_url: clean(place.googleMapsUri, 1000),
          latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
          longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
        });
      }
      pageToken = clean(payload.nextPageToken, 1000) ?? undefined;
      if (!pageToken || places.length === 0) break;
    }
    if (found.size >= maxResults) break;
  }
  return { results: Array.from(found.values()).slice(0, maxResults), queries, errors };
}
async function openStreetMap(skill: string, country: string, city: string, maxResults: number) {
  if (!city) throw new Error("Google Places is not configured. Add GOOGLE_MAPS_API_KEY in Supabase Edge Function secrets, or enter a city to use the free OpenStreetMap fallback.");
  const geoResponse = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q: city + ", " + country, format: "jsonv2", limit: "1",
  }), {
    headers: { "User-Agent": "GlobalLeadAI/1.0 (business discovery)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!geoResponse.ok) throw new Error("Could not locate this city using OpenStreetMap.");
  const geocoded = await geoResponse.json();
  if (!Array.isArray(geocoded) || !geocoded[0]) throw new Error("City not found. Check the city and country names.");
  const lat = Number(geocoded[0].lat), lon = Number(geocoded[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("The location provider returned invalid coordinates.");
  const query = `[out:json][timeout:25];(nwr(around:12000,${lat},${lon})["name"]["shop"];nwr(around:12000,${lat},${lon})["name"]["office"];nwr(around:12000,${lat},${lon})["name"]["amenity"];nwr(around:12000,${lat},${lon})["name"]["tourism"];nwr(around:12000,${lat},${lon})["name"]["craft"];nwr(around:12000,${lat},${lon})["name"]["healthcare"];);out center tags 250;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GlobalLeadAI/1.0" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "OpenStreetMap rate limit reached. Try again later." : "OpenStreetMap discovery is temporarily unavailable.");
  const payload = await response.json();
  const seen = new Set<string>();
  const results = (Array.isArray(payload.elements) ? payload.elements : []).flatMap((element: any) => {
    const tags = element.tags ?? {};
    const name = clean(tags.name, 240);
    if (!name) return [];
    const id = String(element.type) + "/" + String(element.id);
    if (seen.has(id)) return [];
    seen.add(id);
    const latValue = typeof element.lat === "number" ? element.lat : element.center?.lat;
    const lonValue = typeof element.lon === "number" ? element.lon : element.center?.lon;
    const mapUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    return [{
      provider_id: id,
      business_name: name,
      address: clean([tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(", "), 500),
      country,
      city: clean(tags["addr:city"], 100) ?? city,
      website_url: clean(tags.website ?? tags["contact:website"], 1000),
      public_email: clean(tags.email ?? tags["contact:email"], 200),
      public_phone: clean(tags.phone ?? tags["contact:phone"], 80),
      category: clean(tags.shop ?? tags.office ?? tags.amenity ?? tags.tourism ?? tags.craft ?? tags.healthcare, 120) ?? skill,
      source_name: "OpenStreetMap",
      source_url: mapUrl,
      latitude: typeof latValue === "number" ? latValue : null,
      longitude: typeof lonValue === "number" ? lonValue : null,
    }];
  });
  return { results: results.slice(0, maxResults), queries: [`OpenStreetMap business directory around ${city}, ${country}`], errors: [] as string[] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Backend auth configuration is incomplete" }, 503);
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: "Invalid or expired session" }, 401);
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const skill = clean(input.skill, 100) ?? "";
  const country = clean(input.country, 100) ?? "";
  const city = clean(input.city, 100) ?? "";
  const maxResults = typeof input.maxResults === "number" ? Math.floor(input.maxResults) : 100;
  if (skill.length < 2 || country.length < 2) return json({ error: "Enter a skill and a country." }, 400);
  if (maxResults < 1 || maxResults > 100) return json({ error: "Result target must be between 1 and 100." }, 400);
  const area = city ? city + ", " + country : country;
  try {
    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    const output = googleKey
      ? await googlePlaces(skill, area, maxResults, googleKey)
      : await openStreetMap(skill, country, city, maxResults);
    return json({
      status: "ok",
      provider: googleKey ? "google_places" : "openstreetmap",
      providerLabel: googleKey ? "Google Maps / Places" : "OpenStreetMap (free fallback)",
      note: googleKey
        ? "Google Places results are real business listings. Coverage and result count depend on the selected area, query relevance and provider quota."
        : "Google Maps API is not configured. These are OpenStreetMap listings near the selected city, not Google Maps results; coverage and business contact fields may be incomplete.",
      searchedAt: new Date().toISOString(),
      resultCount: output.results.length,
      target: maxResults,
      templateLibrarySize: BUSINESS_TEMPLATE_LIBRARY_SIZE,
      queries: output.queries,
      providerErrors: output.errors,
      results: output.results,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Business discovery failed." }, 502);
  }
});