import { useState } from 'react'
import { Search, ExternalLink, Globe2, ShieldCheck, LoaderCircle, CircleAlert } from 'lucide-react'
import { runPublicSearch, type PublicSearchResult } from './integrationService'

export default function LiveDiscovery() {
  const [query, setQuery] = useState('web development project needed')
  const [results, setResults] = useState<PublicSearchResult[]>([])
  const [searchedAt, setSearchedAt] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = async (event: React.FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 3) { setError('Please enter at least 3 characters.'); return }
    setLoading(true); setError(''); setResults([])
    try {
      const response = await runPublicSearch(query.trim(), 10)
      setResults(response.results); setSearchedAt(response.searchedAt); setSearchedQuery(response.query)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Search failed. Please try again.')
    } finally { setLoading(false) }
  }

  return <div className="page-content live-discovery-page">
    <div className="live-discovery-header">
      <div><div className="eyebrow"><span className="eyebrow-dot"/> MODULE 03 · LIVE PUBLIC WEB SEARCH</div>
        <h1>Discover real <span className="gradient-text">opportunities.</span></h1>
        <p>Search publicly indexed websites and opportunity pages using your server-side Tavily connection.</p>
      </div><div className="live-discovery-icon"><Globe2 size={34}/></div>
    </div>
    <section className="search-panel live-query-panel">
      <div className="panel-heading"><div className="panel-icon"><Search size={19}/></div><div><h2>Run a live web search</h2><p>Use a focused phrase, skill, location or public demand signal.</p></div></div>
      <form className="live-query-form" onSubmit={search}>
        <label className="field live-query-field"><span>Search query</span><input value={query} onChange={event => setQuery(event.target.value)} maxLength={400} placeholder="e.g. need a website developer for my restaurant"/></label>
        <button className="primary-button" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={15} className="live-spin"/> Searching…</> : <>Search the web <Search size={15}/></>}</button>
      </form>
      <div className="panel-foot"><span><ShieldCheck size={14}/> API key stays server-side</span><span><Globe2 size={14}/> Public indexed sources</span><span>Up to 10 results per test</span></div>
    </section>
    {error && <div className="integration-error live-search-error"><CircleAlert size={16}/><span>{error}</span></div>}
    {searchedAt && <div className="live-results-heading"><div><h2>Search results</h2><p>{results.length} real results for “{searchedQuery}”</p></div><small>Checked {new Date(searchedAt).toLocaleString()}</small></div>}
    {results.length > 0 ? <div className="live-results-list">{results.map((result, index) => <article className="live-result-card" key={result.url || index}>
      <div className="live-result-top"><span>WEB RESULT {String(index + 1).padStart(2, '0')}</span>{result.publishedDate && <small>{result.publishedDate}</small>}</div>
      <h3>{result.title || 'Untitled page'}</h3><p>{result.content || 'No page summary was returned.'}</p>
      <div className="live-result-footer"><span>{result.score !== null ? 'Relevance ' + Math.round(result.score * 100) + '%' : 'Relevance not provided'}</span><a href={result.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={12}/></a></div>
    </article>)}</div> : searchedAt ? <div className="content-card live-empty"><strong>No results returned for this query.</strong><p>Try a broader phrase or remove the location constraint.</p></div> : <div className="content-card live-empty"><div className="empty-graphic"><Search size={22}/></div><strong>Ready for your first live search</strong><p>Search will return real indexed pages, not generated or mock leads.</p></div>}
    <div className="integration-security"><ShieldCheck size={16}/><span>Important: this is public web search, not direct access to private accounts or every social platform. Results must be reviewed and qualified before being treated as leads.</span></div>
  </div>
}
