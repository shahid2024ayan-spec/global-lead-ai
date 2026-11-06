import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const providers = [
  {
    id: "google_places",
    name: "Google Places",
    category: "Business discovery",
    env: "GOOGLE_MAPS_API_KEY",
    description: "Business names, locations, websites, phone numbers and place details.",
    setup: "Create a Google Maps Platform API key and enable Places API (New). Restrict the key to the required API.",
    docs: "https://developers.google.com/maps/documentation/places/web-service/overview",
  },
  {
    id: "serpapi",
    name: "SerpApi",
    category: "Search discovery",
    env: "SERPAPI_API_KEY",
    description: "Search engine and Google Maps result discovery through a provider API.",
    setup: "Create a SerpApi account and add its API key to Supabase Edge Function secrets.",
    docs: "https://serpapi.com/",
  },
  {
    id: "tavily",
    name: "Tavily",
    category: "Web intelligence",
    env: "TAVILY_API_KEY",
    description: "Web search and extraction for publicly available business and opportunity pages.",
    setup: "Create a Tavily API key and add it to Supabase Edge Function secrets.",
    docs: "https://docs.tavily.com/",
  },
  {
    id: "reddit",
    name: "Reddit API",
    category: "Public social opportunities",
    env: "REDDIT_CLIENT_ID",
    secondaryEnv: "REDDIT_CLIENT_SECRET",
    description: "Search public Reddit posts using authorized API access and applicable platform rules.",
    setup: "Register a Reddit API application and store both client ID and secret in Supabase Edge Function secrets.",
    docs: "https://www.reddit.com/dev/api/",
  },
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "Backend auth configuration is incomplete" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = providers.map((provider) => {
    const primaryConfigured = Boolean(Deno.env.get(provider.env));
    const secondaryConfigured = "secondaryEnv" in provider
      ? Boolean(Deno.env.get(provider.secondaryEnv))
      : true;
    return {
      id: provider.id,
      name: provider.name,
      category: provider.category,
      description: provider.description,
      setup: provider.setup,
      docs: provider.docs,
      configured: primaryConfigured && secondaryConfigured,
      missingCredentials: [
        ...(!primaryConfigured ? [provider.env] : []),
        ...(!secondaryConfigured && "secondaryEnv" in provider ? [provider.secondaryEnv] : []),
      ],
    };
  });

  return new Response(JSON.stringify({
    status: "ok",
    checkedAt: new Date().toISOString(),
    providers: result,
    configuredCount: result.filter((item) => item.configured).length,
    totalProviders: result.length,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
