import {useEffect,useState} from 'react'
import {MessagesSquare,ExternalLink,LoaderCircle,RefreshCw,Search,ShieldCheck,CircleAlert,CheckCircle2,BookmarkPlus,BrainCircuit} from 'lucide-react'
import {discoverSocialOpportunities,loadSocialOpportunities,scoreSocialOpportunity,type SocialOpportunity} from './socialService'
import {saveSocialToCrm} from '../crm/crmService'

export default function SocialDiscovery({userId}:{userId:string}){
 const [skill,setSkill]=useState('Web development')
 const [market,setMarket]=useState('Worldwide')
 const [items,setItems]=useState<SocialOpportunity[]>([])
 const [loading,setLoading]=useState(false)
 const [refreshing,setRefreshing]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [savingLead,setSavingLead]=useState('')
 const [scoring,setScoring]=useState('')

 const refresh=async()=>{
  setRefreshing(true)
  try{setItems(await loadSocialOpportunities(userId))}
  catch(e){setError(e instanceof Error?e.message:'Could not load public opportunities.')}
  finally{setRefreshing(false)}
 }
 useEffect(()=>{void refresh()},[userId])

 const search=async(e:React.FormEvent)=>{
  e.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   const r=await discoverSocialOpportunities({userId,skill,market,maxResults:20})
   setNotice(`Checked ${r.searchedCount} indexed pages. ${r.savedCount} new public social candidates saved; ${r.duplicateCount} duplicates skipped.`)
   await refresh()
  }catch(reason){setError(reason instanceof Error?reason.message:'Social search failed.')}
  finally{setLoading(false)}
 }
 const scoreLead=async(id:string)=>{
  setScoring(id);setError('');setNotice('')
  try{
   const result=await scoreSocialOpportunity(id)
   setNotice(`Opportunity scored: ${result.score}/100. ${result.explicitBuyingIntent?'Explicit buying-intent wording detected.':'No strong buying-intent wording detected.'}`)
   await refresh()
  }catch(e){setError(e instanceof Error?e.message:'Could not score opportunity.')}
  finally{setScoring('')}
 }
 const saveToCRM=async(id:string)=>{
  setSavingLead(id);setError('');setNotice('')
  try{
   const added=await saveSocialToCrm(userId,id)
   setNotice(added?'Social opportunity added to CRM.':'This opportunity is already in your CRM.')
  }catch(e){setError(e instanceof Error?e.message:'Could not save opportunity to CRM.')}
  finally{setSavingLead('')}
 }

 return <div className="page-content social-discovery-page">
  <div className="live-discovery-header">
   <div><div className="eyebrow"><span className="eyebrow-dot"/> MODULE 06 · PUBLIC SOCIAL OPPORTUNITIES</div><h1>Spot active <span className="gradient-text">buyer demand.</span></h1><p>Search publicly indexed social posts that may signal a real need for your service.</p></div>
   <div className="live-discovery-icon"><MessagesSquare size={34}/></div>
  </div>
  <section className="search-panel business-search-panel">
   <div className="panel-heading"><div className="panel-icon"><Search size={19}/></div><div><h2>Find public social requests</h2><p>Search indexed LinkedIn, Facebook and X pages. Private posts are not accessed.</p></div></div>
   <form className="business-query-form" onSubmit={search}>
    <label className="field"><span>Your service</span><input value={skill} onChange={e=>setSkill(e.target.value)} maxLength={100} required/></label>
    <label className="field"><span>Target market</span><input value={market} onChange={e=>setMarket(e.target.value)} maxLength={100} required/></label>
    <button className="primary-button" type="submit" disabled={loading||refreshing||skill.trim().length<2||market.trim().length<2}>{loading?<><LoaderCircle size={15} className="live-spin"/> Searching…</>:<>Find opportunities <Search size={15}/></>}</button>
   </form>
   <div className="panel-foot"><span><ShieldCheck size={14}/> Public pages only</span><span>Up to 20 search results</span><span>Basic search depth</span></div>
  </section>
  {error&&<div className="integration-error live-search-error"><CircleAlert size={16}/><span>{error}</span></div>}
  {notice&&<div className="inline-notice business-notice"><CheckCircle2 size={15}/>{notice}</div>}
  <div className="business-list-heading"><div><h2>Social opportunity candidates</h2><p>{items.length} saved records · newest first</p></div><button className="secondary-button" onClick={()=>void refresh()} disabled={refreshing}><RefreshCw size={14}/> Refresh</button></div>
  {refreshing?<div className="content-card live-empty"><LoaderCircle className="live-spin"/><p>Loading public opportunities…</p></div>:items.length?
   <div className="business-candidate-list">
    {items.map(item=><article className="business-candidate-card" key={item.id}>
     <div className="business-candidate-icon"><MessagesSquare size={19}/></div>
     <div className="business-candidate-main">
      <div className="business-candidate-top"><h3>{item.platform} · {item.author_name||'Public post author not identified'}</h3><span className="candidate-status">{item.verification_status.replace('_',' ')}</span></div>
      <p>{item.requested_service||'Service request'} · {item.city||item.country||'Location not verified'}</p>
      <div className="social-post-preview">{item.post_text}</div>
      <div className="business-candidate-meta"><span>Urgency: {item.urgency}</span><span>Budget: {item.budget_text||'Not stated'}</span><span>Score: {item.lead_score}/100</span></div>
      <div className="candidate-actions">
       <button type="button" className="candidate-save-button candidate-analyze-button" onClick={()=>void scoreLead(item.id)} disabled={scoring===item.id}>{scoring===item.id?<><LoaderCircle size={13} className="live-spin"/> Scoring…</>:<><BrainCircuit size={13}/> Score signals</>}</button>
       <a href={item.post_url} target="_blank" rel="noreferrer">Review original post <ExternalLink size={12}/></a>
       <button type="button" className="candidate-save-button" onClick={()=>void saveToCRM(item.id)} disabled={savingLead===item.id}><BookmarkPlus size={13}/>{savingLead===item.id?'Saving…':'Add to CRM'}</button>
      </div>
      {item.score_reason&&<p className="business-analysis-line">{item.score_reason}</p>}
     </div>
    </article>)}
   </div>
   :<div className="content-card live-empty"><div className="empty-graphic"><MessagesSquare size={22}/></div><strong>No public social candidates saved yet</strong><p>Run a search above. Results are limited to publicly indexed posts on supported platforms.</p></div>}
  <div className="integration-security"><ShieldCheck size={16}/><span>Search indexing does not guarantee that a result is an active request. Review the original post, date, author and buying intent. No private account scraping, guessed contacts, budgets or fabricated opportunities.</span></div>
 </div>
}
