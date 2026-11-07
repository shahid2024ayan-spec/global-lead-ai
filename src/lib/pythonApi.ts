import { supabase } from './supabase'

const baseUrl = (import.meta.env.VITE_PYTHON_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export async function pythonApi<T = any>(path: string, body?: unknown): Promise<T> {
  if (!supabase) throw new Error('Supabase authentication is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Your session expired. Please sign in again.')
  const response = await fetch(baseUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Python API request failed (' + response.status + ').')
  return payload as T
}
