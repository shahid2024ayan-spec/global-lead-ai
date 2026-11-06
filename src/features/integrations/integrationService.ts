import { supabase } from '../../lib/supabase'

export type IntegrationProvider = {
  id: string; name: string; category: string; description: string; setup: string; docs: string
  configured: boolean; missingCredentials: string[]
}
export type IntegrationStatus = {
  status: 'ok'; checkedAt: string; configuredCount: number; totalProviders: number
  providers: IntegrationProvider[]
}
export type PublicSearchResult = {
  title: string; url: string; content: string; score: number | null; publishedDate: string | null
}
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('integration-status', { method: 'GET' })
  if (error) throw new Error(error.message || 'Could not load provider status.')
  if (!data || data.status !== 'ok' || !Array.isArray(data.providers)) throw new Error('The integration status response was invalid.')
  return data as IntegrationStatus
}
export async function runPublicSearch(query: string, maxResults = 10) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('lead-discovery', { body: { query, maxResults, searchDepth: 'basic' } })
  if (error) throw new Error(error.message || 'Could not run public web search.')
  if (!data || data.status !== 'ok' || !Array.isArray(data.results)) throw new Error(data?.error || 'The search response was invalid.')
  return data as { status: 'ok'; provider: 'tavily'; query: string; resultCount: number; searchedAt: string; results: PublicSearchResult[] }
}

export type SkillIntelligenceProfile = {
  primarySkill: string
  category: string
  relatedServices: string[]
  synonyms: string[]
  buyerIntentKeywords: string[]
  problemKeywords: string[]
  longTailQueries: string[]
  tavilyQueries: { business: string[]; social: string[]; hiring: string[]; communities: string[] }
  excludeKeywords: string[]
}
export async function generateSkillIntelligence(input: { skill: string; market: string; niche?: string; languages?: string[] }) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('skill-intelligence', { body: input })
  if (error) {
    let serverMessage = ''
    const context = (error as { context?: unknown }).context
    if (context && typeof context === 'object' && 'json' in context && typeof (context as Response).json === 'function') {
      try {
        const payload = await (context as Response).json()
        if (typeof payload?.error === 'string') serverMessage = payload.error
      } catch { /* keep the safe generic message */ }
    }
    throw new Error(serverMessage || error.message || 'Could not generate skill intelligence.')
  }
  if (!data || data.status !== 'ok' || !data.profile) throw new Error(data?.error || 'The AI response was invalid.')
  return data as { status: 'ok'; provider: 'gemini'; model: string; generatedAt: string; profile: SkillIntelligenceProfile; note: string }
}
