import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, CircleAlert, ExternalLink, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { getIntegrationStatus, type IntegrationStatus } from './integrationService'

export default function IntegrationSettings() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStatus(await getIntegrationStatus())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not check integrations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return <div className="integration-settings">
    <div className="integration-heading">
      <div><div className="eyebrow">MODULE 03 · API & DATA INTEGRATION</div><h2>Connected data sources</h2><p>Provider credentials stay on the server. The browser only receives connection status.</p></div>
      <button className="secondary-button integration-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> {loading ? 'Checking…' : 'Refresh status'}</button>
    </div>
    {error && <div className="integration-error" role="alert"><CircleAlert size={16}/><span>{error}. Confirm that the integration-status Edge Function is deployed and try again.</span></div>}
    {status && <>
      <div className="integration-summary"><div className="integration-summary-icon"><Activity size={19}/></div><div><strong>{status.configuredCount} of {status.totalProviders} providers configured</strong><small>Last checked {new Date(status.checkedAt).toLocaleString()}</small></div><span className="integration-count">{status.configuredCount}/{status.totalProviders}</span></div>
      <div className="integration-list">{status.providers.map(provider => <article className="integration-card" key={provider.id}>
        <div className="integration-card-top"><div><strong>{provider.name}</strong><small>{provider.category}</small></div><span className={provider.configured ? 'integration-state ready' : 'integration-state pending'}>{provider.configured ? <CheckCircle2 size={13}/> : <CircleAlert size={13}/>} {provider.configured ? 'Connected' : 'Setup required'}</span></div>
        <p>{provider.description}</p>
        {!provider.configured && <div className="integration-setup"><KeyRound size={14}/><span>{provider.setup}</span></div>}
        <a href={provider.docs} target="_blank" rel="noreferrer">Provider documentation <ExternalLink size={12}/></a>
      </article>)}</div>
    </>}
    {!status && loading && <div className="integration-loading"><span className="loading-spinner"/> Checking secure provider configuration…</div>}
    <div className="integration-security"><ShieldCheck size={16}/><span>Never paste API secrets into chat or browser code. Add credentials only to Supabase Edge Function secrets. No provider is marked connected until its server-side credential is present.</span></div>
  </div>
}
