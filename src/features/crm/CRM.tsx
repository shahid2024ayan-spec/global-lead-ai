import{useEffect,useState}from'react'
import{Users,ExternalLink,LoaderCircle,RefreshCw,ShieldCheck,CircleAlert,BriefcaseBusiness}from'lucide-react'
import{loadCRMLeads,updateCRMLead,type CRMLead}from'./crmService'
const stages=['new','qualified','contacted','replied','interested','negotiation','won','lost']
export default function CRM({userId}:{userId:string}){
 const[leads,setLeads]=useState<CRMLead[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const refresh=async()=>{setLoading(true);try{setLeads(await loadCRMLeads(userId))}catch(e){setError(e instanceof Error?e.message:'Could not load CRM.')}finally{setLoading(false)}}
 useEffect(()=>{void refresh()},[userId])
 const update=async(id:string,updates:Parameters<typeof updateCRMLead>[2])=>{setSaving(id);setError('');setNotice('');try{await updateCRMLead(userId,id,updates);setNotice('CRM record updated.');await refresh()}catch(e){setError(e instanceof Error?e.message:'Update failed.')}finally{setSaving('')}}
 const title=(lead:CRMLead)=>lead.business_leads?.business_name||lead.social_opportunities?.platform+' opportunity'||'Saved lead'
 const url=(lead:CRMLead)=>lead.business_leads?.website_url||lead.business_leads?.source_url||lead.social_opportunities?.post_url||''
 return <div className="page-content crm-page">
  <div className="live-discovery-header"><div><div className="eyebrow"><span className="eyebrow-dot"/> MODULE 09 · CLIENT ACQUISITION CRM</div><h1>Manage your <span className="gradient-text">client pipeline.</span></h1><p>Track every saved business and public opportunity from first contact to won or lost.</p></div><div className="live-discovery-icon"><Users size={34}/></div></div>
  <div className="crm-stage-strip">{stages.map(stage=><div className="crm-stage-chip" key={stage}><span>{leads.filter(l=>l.crm_status===stage).length}</span>{stage}</div>)}</div>
  {error&&<div className="integration-error live-search-error"><CircleAlert size={16}/>{error}</div>}{notice&&<div className="inline-notice">{notice}</div>}
  <div className="business-list-heading"><div><h2>Your saved leads</h2><p>{leads.length} records · your private workspace</p></div><button className="secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
  {loading?<div className="content-card live-empty"><LoaderCircle className="live-spin"/><p>Loading pipeline…</p></div>:leads.length?<div className="crm-lead-list">{leads.map(lead=><article className="crm-lead-card" key={lead.id}>
   <div className="crm-lead-heading"><div className="business-candidate-icon"><BriefcaseBusiness size={18}/></div><div className="crm-lead-title"><h3>{title(lead)}</h3><p>{lead.business_leads?'Business candidate':lead.social_opportunities?.platform+' public opportunity'}</p></div>{url(lead)&&<a href={url(lead)} target="_blank" rel="noreferrer" aria-label="Open original source"><ExternalLink size={15}/></a>}</div>
   <div className="crm-edit-grid"><label className="field"><span>Pipeline stage</span><select value={lead.crm_status} onChange={e=>void update(lead.id,{crm_status:e.target.value})}>{stages.map(stage=><option key={stage} value={stage}>{stage[0].toUpperCase()+stage.slice(1)}</option>)}</select></label><label className="field"><span>Priority</span><select value={lead.priority} onChange={e=>void update(lead.id,{priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label><label className="field"><span>Deal value (optional)</span><input type="number" min="0" step="0.01" defaultValue={lead.deal_value??''} placeholder="0.00" onBlur={e=>{const v=e.target.value;void update(lead.id,{deal_value:v===''?null:Number(v)})}}/></label><label className="field"><span>Next follow-up</span><input type="datetime-local" defaultValue={lead.next_follow_up_at?new Date(lead.next_follow_up_at).toISOString().slice(0,16):''} onBlur={e=>void update(lead.id,{next_follow_up_at:e.target.value?new Date(e.target.value).toISOString():null})}/></label></div>
   <label className="field crm-note-field"><span>Private notes</span><textarea rows={2} defaultValue={lead.notes||''} placeholder="Add contact history, requirements or next action…" onBlur={e=>void update(lead.id,{notes:e.target.value})}/></label>
   {saving===lead.id&&<small className="crm-saving"><LoaderCircle size={12} className="live-spin"/> Saving changes…</small>}
  </article>)}</div>:<div className="content-card live-empty"><div className="empty-graphic"><Users size={22}/></div><strong>Your CRM is empty</strong><p>Save a business candidate or social opportunity to CRM to start tracking your pipeline.</p></div>}
  <div className="integration-security"><ShieldCheck size={16}/><span>CRM data is scoped to your authenticated account. Outreach automation is not enabled; you stay in control of every message.</span></div>
 </div>
}
