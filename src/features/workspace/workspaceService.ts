import { supabase } from '../../lib/supabase'

export type WorkspaceCounts = {
  businesses: number
  opportunities: number
  savedLeads: number
}

export async function loadWorkspaceCounts(userId: string): Promise<WorkspaceCounts> {
  if (!supabase) throw new Error('Database connection is not configured.')
  const [businesses, opportunities, savedLeads] = await Promise.all([
    supabase.from('business_leads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('social_opportunities').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('saved_leads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  const failure = businesses.error ?? opportunities.error ?? savedLeads.error
  if (failure) throw failure
  return {
    businesses: businesses.count ?? 0,
    opportunities: opportunities.count ?? 0,
    savedLeads: savedLeads.count ?? 0,
  }
}
