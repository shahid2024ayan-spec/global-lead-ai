import { useState } from 'react'
import { Sparkles, Globe2, Languages, Search, Copy, LoaderCircle, ShieldCheck, Lightbulb, Target, BriefcaseBusiness, Filter, ExternalLink } from 'lucide-react'
import { generateSkillIntelligence, runPublicSearch, type PublicSearchResult, type SkillIntelligenceProfile } from './integrationService'

const sections = [
  { key: 'relatedServices', title: 'Related services', icon: BriefcaseBusiness, description: 'Adjacent services you can offer or bundle.' },
  { key: 'synonyms', title: 'Skill synonyms', icon: Languages, description: 'Different terms buyers use for the same service.' },
  { key: 'buyerIntentKeywords', title: 'Buyer-intent keywords', icon: Target, description: 'Phrases that may indicate someone is ready to hire.' },
  { key: 'problemKeywords', title: 'Business problems', icon: Lightbulb, description: 'Problems your service can help solve.' },
  { key: 'longTailQueries', title: 'Long-tail searches', icon: Search, description: 'Specific searches for discovering relevant pages.' },
  { key: 'excludeKeywords', title: 'Exclude / filter terms', icon: Filter, description: 'Terms that may help reduce irrelevant results.' },
] as const

export default function SkillIntelligence() {
  const [skill, setSkill] = useState('Web development')
  const [market, setMarket] = useState('Worldwide')
  const [niche, setNiche] = useState('')
  const [language, setLanguage] = useState('English')
  const [profile, setProfile] = useState<SkillIntelligenceProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [searchingQuery, setSearchingQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState<PublicSearchResult[]>([])
  const [searchTimestamp, setSearchTimestamp] = useState('')

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true); setError(''); setProfile(null); setCopied('')
    setSearchResults([]); setSearchError(''); setSearchingQuery(''); setSearchTimestamp('')
    try {
      const result = await generateSkillIntelligence({ skill, market, niche, languages: [language] })
      setProfile(result.profile)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate skill intelligence.')
    } finally { setLoading(false) }
  }

  const copyText = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key) }
    catch { setError('Clipboard access was blocked. Select and copy the text manually.') }
  }

  const searchQuery = async (query: string) => {
    setSearchingQuery(query); setSearchError(''); setSearchResults([]); setSearchTimestamp('')
    try {
      const response = await runPublicSearch(query, 10)
      setSearchResults(response.results); setSearchTimestamp(response.searchedAt)
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : 'Could not search this query.')
    } finally { setSearchingQuery('') }
  }

  return <div className="page-content skill-intelligence-page">
    <div className="skill-hero">
      <div><div className="eyebrow"><span className="eyebrow-dot"/> MODULE 04 · AI SKILL INTELLIGENCE</div>
        <h1>Turn one skill into <span className="gradient-text">a search strategy.</span></h1>
        <p>Gemini maps your service into buyer language, related offers, problem signals and ready-to-use discovery queries.</p>
      </div><div className="skill-hero-icon"><Sparkles size={34}/></div>
    </div>
    <section className="search-panel skill-input-panel">
      <div className="panel-heading"><div className="panel-icon"><Sparkles size={19}/></div><div><h2>Build your skill profile</h2><p>Give the AI a service and a market to target.</p></div><span className="step-label">04 <span>/ 10</span></span></div>
      <form className="skill-form" onSubmit={generate}>
        <label className="field"><span>Your skill or service</span><input required minLength={2} maxLength={120} value={skill} onChange={e => setSkill(e.target.value)} placeholder="e.g. Web development"/></label>
        <label className="field"><span>Target market</span><select value={market} onChange={e => setMarket(e.target.value)}><option>Worldwide</option><option>Pakistan</option><option>United States</option><option>United Kingdom</option><option>United Arab Emirates</option><option>Canada</option><option>Australia</option><option>Germany</option><option>Saudi Arabia</option></select></label>
        <label className="field"><span>Business niche (optional)</span><input maxLength={120} value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. Restaurants, real estate, clinics"/></label>
        <label className="field"><span>Preferred language</span><select value={language} onChange={e => setLanguage(e.target.value)}><option>English</option><option>English and Urdu</option><option>Arabic</option><option>Spanish</option><option>French</option><option>German</option></select></label>
        <button className="primary-button skill-generate-button" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={15} className="skill-spin"/> Analysing skill…</> : <>Generate with Gemini <Sparkles size={15}/></>}</button>
      </form>
      <div className="panel-foot"><span><ShieldCheck size={14}/> Secure server-side AI</span><span><Globe2 size={14}/> Market-aware suggestions</span><span><Languages size={14}/> Language-aware terms</span></div>
    </section>
    {error && <div className="integration-error skill-error" role="alert"><span>{error}</span></div>}
    {profile && <>
      <div className="skill-profile-heading"><div><div className="eyebrow">GENERATED SKILL PROFILE</div><h2>{profile.primarySkill}</h2><p>{profile.category} · {market}</p></div><span className="skill-model-label"><Sparkles size={13}/> Gemini AI</span></div>
      <div className="skill-section-grid">
        {sections.map(section => { const Icon = section.icon; const values = profile[section.key]; return <article className="content-card skill-result-card" key={section.key}>
          <div className="skill-result-title"><div className="panel-icon"><Icon size={16}/></div><div><h3>{section.title}</h3><p>{section.description}</p></div></div>
          <div className="skill-chip-list">{values.length ? values.map((item, index) => <span className="skill-chip" key={index}>{item}</span>) : <small className="skill-no-items">No suggestions returned.</small>}</div>
          <button className="skill-copy-button" onClick={() => void copyText(section.key, values.join('\n'))}><Copy size={12}/>{copied === section.key ? 'Copied' : 'Copy list'}</button>
        </article> })}
      </div>
      <section className="content-card tavily-query-card">
        <div className="card-title"><div><h3><Search size={16}/> Tavily-ready discovery queries</h3><p>Run any generated query against live public web search. Each search returns real indexed pages, not qualified leads.</p></div></div>
        {Object.entries(profile.tavilyQueries).map(([group, queries]) => <div className="query-group" key={group}><div className="query-group-heading"><strong>{group}</strong><button onClick={() => void copyText('query-' + group, queries.join('\n'))}><Copy size={12}/>{copied === 'query-' + group ? 'Copied' : 'Copy'}</button></div>{queries.map((query, index) => <div className="query-line" key={index}><span>{query}</span><div className="query-actions"><button aria-label="Search this query" title="Search live web" disabled={!!searchingQuery} onClick={() => void searchQuery(query)}><Search size={13}/></button><button aria-label="Copy query" title="Copy query" onClick={() => void copyText('single-' + group + index, query)}><Copy size={12}/></button></div></div>)}</div>)}
      </section>
      {(searchingQuery || searchError || searchTimestamp) && <section className="content-card generated-search-panel">
        <div className="card-title"><div><h3>Live search results</h3><p>{searchingQuery ? 'Searching Tavily for: ' + searchingQuery : 'Query: ' + (searchTimestamp ? 'completed' : 'not completed')}</p></div>{searchingQuery && <LoaderCircle size={17} className="skill-spin"/>}</div>
        {searchError && <div className="integration-error">{searchError}</div>}
        {searchTimestamp && <small className="generated-search-time">Checked {new Date(searchTimestamp).toLocaleString()} · {searchResults.length} results</small>}
        {searchResults.map((item, index) => <article className="generated-search-result" key={item.url || index}><strong>{item.title || 'Untitled page'}</strong><p>{item.content}</p><a href={item.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={12}/></a></article>)}
        {searchTimestamp && !searchResults.length && <p className="skill-no-items">No indexed pages returned. Try another query.</p>}
      </section>}
      <div className="skill-disclaimer"><ShieldCheck size={15}/><span>AI-generated suggestions, not verified market demand. Search results need source checks, recency checks and human qualification. No client or budget has been invented.</span></div>
    </>}
    {!profile && !loading && <div className="content-card skill-empty"><div className="empty-graphic"><Sparkles size={22}/></div><strong>Your skill intelligence report will appear here</strong><p>Generate a profile to reveal related services, buyer language and discovery query packs.</p></div>}
    {loading && <div className="content-card skill-empty"><LoaderCircle size={22} className="skill-spin"/><strong>Analysing your service…</strong><p>Gemini is mapping buyer terms and discovery opportunities.</p></div>}
  </div>
}
