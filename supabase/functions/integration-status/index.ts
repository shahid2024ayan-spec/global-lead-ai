import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const providers = [
  {
    id: "tavily",
    name: "Tavily Search",
    category: "Web & public opportunity discovery",
    env: "TAVILY_API_KEY",
    description: "Searches publicly indexed business websites and public opportunity pages. It does not provide private or complete access to social networks.",
    setup: "Add TAVILY_API_KEY under Supabase Edge Function secrets.",
    docs: "https://docs.tavily.com/",
  },
  {
    id: "google_places",
    name: "Google Maps / Places",
    category: "Maps-first business discovery",
    env: "GOOGLE_MAPS_API_KEY",
    description: "Finds real business listings, addresses and Google Maps links. Website and contact enrichment runs separately. Uses OpenStreetMap as a free fallback when not configured.",
    setup: "Optional: add GOOGLE_MAPS_API_KEY under Supabase Edge Function secrets. Keep it server-side, restrict the key to Places API (New), and enable Google Cloud billing. Google Maps is pay-as-you-go; without this key, city searches use free OpenStreetMap.",
    docs: "https://developers.google.com/maps/documentation/places/web-service",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "AI analysis",
    env: "GEMINI_API_KEY",
    description: "Powers AI lead analysis, qualification, scoring and outreach drafting.",
    setup: "Add GEMINI_API_KEY under Supabase Edge Function secrets.",
    docs: "https://ai.google.dev/gemini-api/docs",
  },
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Backend auth configuration is incomplete" }, 503);

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: "Invalid or expired session" }, 401);

  const result = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    category: provider.category,
    description: provider.description,
    setup: provider.setup,
    docs: provider.docs,
    configured: Boolean(Deno.env.get(provider.env)),
    missingCredentials: Deno.env.get(provider.env) ? [] : [provider.env],
  }));

  return json({
    status: "ok",
    checkedAt: new Date().toISOString(),
    providers: result,
    configuredCount: result.filter((item) => item.configured).length,
    totalProviders: result.length,
  });
});