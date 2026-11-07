import { supabase } from '../../lib/supabase'
import { pythonApi } from '../../lib/pythonApi'
export type BusinessLead = { id:string; project_id:string|null; business_name:string; website_url:string|null; country:string|null; city:string|null; category:string|null; source_name:string; source_url:string|null; lead_score:number; verification_status:string; created_at:string; website_quality:string|null; identified_gaps:string[]; recommended_service:string|null; score_reason:string|null; last_verified_at:string|null; website_status:string; mobile_responsive:boolean|null; page_load_ms:number|null; seo_issues:string[]; website_audit:Record<string,unknown> }
export async function loadBusinessLeads(userId:string):Promise<BusinessLead[]> {
  if(!supabase) throw new Error('Database connection is not configured.')
  const {data,error}=await supabase.from('business_leads').select('id,project_id,business_name,website_url,country,city,category,source_name,source_url,lead_score,verification_status,created_at,website_quality,identified_gaps,recommended_service,score_reason,last_verified_at,website_status,mobile_responsive,page_load_ms,seo_issues,website_audit').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
  if(error) throw error
  return (data??[]) as BusinessLead[]
}
export type DiscoveryCallbacks={onJobCreated?:(id:string)=>void;onProgress?:(progress:number)=>void}
export type BusinessDiscoveryResult={searchedCount:number;candidateCount:number;savedCount:number;duplicateCount:number;queries:string[];partial:boolean;partialError:string;provider:string;providerLabel:string;providerNote:string}
async function waitForJob(userId:string,jobId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data,error}=await supabase.from('search_jobs').select('status').eq('id',jobId).eq('user_id',userId).single()
 if(error)throw error
 if(data.status==='cancelled')throw new Error('Search cancelled. Results saved before cancellation remain in your workspace.')
 if(data.status==='paused')throw new Error('Search paused. Resume it and run the search again.')
 if(data.status!=='running')throw new Error('Search job is no longer running.')
}
export async function discoverBusinesses(input:{userId:string;skill:string;country:string;city?:string;maxResults?:number}&DiscoveryCallbacks):Promise<BusinessDiscoveryResult>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const skill=input.skill.trim(),country=input.country.trim(),city=(input.city??'').trim(),maxResults=Math.min(100,Math.max(1,Math.floor(input.maxResults??100)))
 if(skill.length<2||country.length<2)throw new Error('Enter a valid skill and country.')
 const area=city?city+', '+country:country
 const{data:project,error:projectError}=await supabase.from('search_projects').insert({user_id:input.userId,name:(skill+' — '+area).slice(0,120),target_scope:city?'city':'country',target_country:country,target_city:city||null,source_mode:'businesses',status:'running',preferences:{skill,country,city:city||null,discovery:'maps-first-businesses',resultLimit:maxResults}}).select('id').single()
 if(projectError)throw projectError
 const{data:job,error:jobError}=await supabase.from('search_jobs').insert({user_id:input.userId,project_id:project.id,status:'running',progress:5,started_at:new Date().toISOString()}).select('id').single()
 if(jobError){await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw jobError}
 input.onJobCreated?.(job.id);input.onProgress?.(8)
 try{
  await waitForJob(input.userId,job.id)
  const response=await pythonApi<{provider:string;providerLabel:string;searchedCount:number;results:Record<string,unknown>[];partial:boolean;partialError:string;queries:string[];providerNote:string}>('/api/discover/businesses',{skill,country,city:city||null,maxResults})
  if(!response||!Array.isArray(response.results))throw new Error('The Python business discovery response was invalid.')
  input.onProgress?.(65)
  const{data:existing,error:existingError}=await supabase.from('business_leads').select('source_url').eq('user_id',input.userId)
  if(existingError)throw existingError
  const seen=new Set((existing??[]).map(row=>row.source_url).filter(Boolean))
  const candidates=response.results.filter((item:Record<string,unknown>)=>typeof item.business_name==='string'&&item.business_name.trim().length>1)
  const fresh=candidates.filter((item:Record<string,unknown>)=>typeof item.source_url==='string'&&!seen.has(item.source_url))
  const duplicateCount=candidates.length-fresh.length
  const rows=fresh.map((item:Record<string,unknown>)=>({
   user_id:input.userId,project_id:project.id,search_job_id:job.id,
   business_name:String(item.business_name).slice(0,240),
   website_url:typeof item.website_url==='string'?item.website_url:null,
   public_email:typeof item.public_email==='string'?item.public_email:null,
   public_phone:typeof item.public_phone==='string'?item.public_phone:null,
   country:typeof item.country==='string'?item.country:country,
   city:typeof item.city==='string'?item.city:(city||null),
   address:typeof item.address==='string'?item.address:null,
   category:typeof item.category==='string'?item.category:skill,
   source_name:typeof response.providerLabel==='string'?response.providerLabel:'Business map provider',
   source_url:typeof item.source_url==='string'?item.source_url:null,
   lead_score:0,score_reason:'Not scored yet. Website, public evidence and service fit must be inspected.',
   verification_status:'unverified'
  }))
  if(rows.length){const{error}=await supabase.from('business_leads').insert(rows);if(error)throw error}
  input.onProgress?.(88)
  const partial=Boolean(response.partial)
  const partialError=String(response.partialError??'')
  const{error:jobUpdateError}=await supabase.from('search_jobs').update({status:'completed',progress:100,businesses_found:rows.length,error_message:partial?('Partial provider results: '+partialError).slice(0,500):null,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  if(jobUpdateError)throw jobUpdateError
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  input.onProgress?.(100)
  return{searchedCount:Number(response.searchedCount??candidates.length),candidateCount:candidates.length,savedCount:rows.length,duplicateCount,queries:Array.isArray(response.queries)?response.queries:[],partial,partialError,provider:String(response.provider??'unknown'),providerLabel:String(response.providerLabel??'Business map provider'),providerNote:String(response.providerNote??'')}
 }catch(error){
  const message=error instanceof Error?error.message:'Business discovery failed.'
  const cancelled=message.startsWith('Search cancelled.')
  await supabase.from('search_jobs').update({status:cancelled?'cancelled':'failed',error_message:message.slice(0,500),completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:cancelled?'cancelled':'failed'}).eq('id',project.id).eq('user_id',input.userId)
  throw error
 }
}
export type BusinessAnalysis={
 status:'ok';leadId:string;model:string;score:number;needScore:number;fitScore:number;confidence:number;
 needLevel:'strong_need'|'likely_opportunity'|'possible_opportunity'|'insufficient_evidence';
 needReasons:string[];scoreParts:Record<string,number>;websiteQuality:string;identifiedGaps:string[];
 recommendedService:string|null;evidenceSummary:string;evidenceCount:number;
 evidence:{title:string;url:string|null;content?:string;source?:string}[];
 verificationStatus:string;websiteAudit:Record<string,unknown>;analyzedAt:string
}
export async function enrichBusinessLead(businessLeadId:string):Promise<BusinessAnalysis>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data:lead,error:leadError}=await supabase.from('business_leads')
  .select('id,user_id,project_id,business_name,website_url,country,city,address,category,source_name,source_url,public_email,public_phone')
  .eq('id',businessLeadId).single()
 if(leadError||!lead)throw new Error(leadError?.message||'Business candidate not found.')
 let skill=String(lead.category||'').trim()||'web development'
 if(lead.project_id){
  const {data:project}=await supabase.from('search_projects').select('preferences')
   .eq('id',lead.project_id).eq('user_id',lead.user_id).maybeSingle()
  const preferences=project?.preferences as Record<string,unknown>|null
  if(typeof preferences?.skill==='string'&&preferences.skill.trim())skill=preferences.skill.trim()
 }
 const result=await pythonApi<BusinessAnalysis>('/api/ai/analyze',{
  skill,
  business:{
   business_name:lead.business_name,website_url:lead.website_url,country:lead.country,
   city:lead.city,address:lead.address,category:lead.category,source_name:lead.source_name,
   source_url:lead.source_url,public_email:lead.public_email,public_phone:lead.public_phone
  }
 })
 if(!result||result.status!=='ok')throw new Error('Python business analysis returned an invalid response.')
 const audit=result.websiteAudit||{}
 const now=new Date().toISOString()
 const scoreReason='Business need: '+result.needScore+'/100; skill fit: '+result.fitScore+'/100; confidence: '+Math.round(result.confidence*100)+'%. '+result.needReasons.join(' ')
 const {error:saveError}=await supabase.from('business_leads').update({
  website_quality:result.websiteQuality,identified_gaps:result.identifiedGaps,
  recommended_service:result.recommendedService,lead_score:result.score,score_reason:scoreReason,
  verification_status:result.verificationStatus,last_verified_at:(result.evidenceCount>0||Boolean(audit.htmlChecked))?now:null,
  website_status:typeof audit.status==='string'?audit.status:'unknown',
  website_audit:{...audit,aiAnalysis:{needScore:result.needScore,fitScore:result.fitScore,confidence:result.confidence,needLevel:result.needLevel,needReasons:result.needReasons}},mobile_responsive:typeof audit.mobileResponsive==='boolean'?audit.mobileResponsive:null,
  page_load_ms:typeof audit.pageLoadMs==='number'?audit.pageLoadMs:null,
  seo_issues:Array.isArray(audit.seoIssues)?audit.seoIssues:[],website_audited_at:now
 }).eq('id',businessLeadId).eq('user_id',lead.user_id)
 if(saveError)throw new Error('Analysis completed but could not be saved: '+saveError.message)
 const {data:oldEvidence,error:oldError}=await supabase.from('lead_evidence').select('evidence_url')
  .eq('business_lead_id',businessLeadId).eq('user_id',lead.user_id)
 if(oldError)throw new Error('Analysis saved, but evidence could not be checked: '+oldError.message)
 const known=new Set((oldEvidence??[]).map(row=>row.evidence_url).filter(Boolean))
 const evidenceRows=result.evidence.filter(item=>typeof item.url==='string'&&/^https?:\\/\\//i.test(item.url)&&!known.has(item.url))
  .map(item=>({user_id:lead.user_id,business_lead_id:businessLeadId,evidence_type:item.source||'public_web_evidence',
   description:(item.title+': '+(item.content||result.evidenceSummary)).slice(0,1200),evidence_url:item.url,observed_at:now}))
 if(evidenceRows.length){
  const {error:evidenceError}=await supabase.from('lead_evidence').insert(evidenceRows)
  if(evidenceError)throw new Error('Analysis saved, but evidence could not be saved: '+evidenceError.message)
 }
 return {...result,leadId:businessLeadId}
}

export type LeadEvidence={id:string;evidence_type:string;description:string;evidence_url:string|null;observed_at:string}
export async function loadBusinessEvidence(businessLeadId:string):Promise<LeadEvidence[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.from('lead_evidence').select('id,evidence_type,description,evidence_url,observed_at').eq('business_lead_id',businessLeadId).order('observed_at',{ascending:false}).limit(10)
 if(error)throw error
 return (data??[]) as LeadEvidence[]
}
