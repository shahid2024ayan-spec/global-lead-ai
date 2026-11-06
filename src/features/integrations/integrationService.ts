import { supabase } from '../../lib/supabase'

export type IntegrationProvider = {
  id: string
  name: string
  category: string
  description: string
  setup: string
  docs: string
  configured: boolean
  missingCredentials: string[]
}

export type IntegrationStatus = {
  status: 'ok'
  checkedAt: string
  configuredCount: number
  totalProviders: number
  providers: IntegrationProvider[]
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('integration-status', {
    method: 'GET',
  })
  if (error) throw new Error(error.message || 'Could not load provider status.')
  if (!data || data.status !== 'ok' || !Array.isArray(data.providers)) {
    throw new Error('The integration status response was invalid.')
  }
  return data as IntegrationStatus
}
