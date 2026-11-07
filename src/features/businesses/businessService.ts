import { supabase } from '../../lib/supabase'
export type BusinessLead = { id:string; business_name:string; website_url:string|null; country:string|null; city:string|null; category:string|null; source_name:string; source_url:string|null; lead_score:number; verification_status:string; created_at:string; website_quality:string|null; identified_gaps:string[]; recommended_service:string|null; score_reason:string|null; last_verified_at:string|null }
export async function loadBusinessLeads(userId:string):Promise<BusinessLead[]> {
  if(!supabase) throw new Error('Database connection is not configured.')
  const {data,error}=await supabase.from('business_leads').select('id,business_name,website_url,country,city,category,source_name,source_url,lead_score,verification_status,created_at,website_quality,identified_gaps,recommended_service,score_reason,last_verified_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
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
  const{data:response,error:invokeError}=await supabase.functions.invoke('maps-business-discovery',{body:{skill,country,city:city||null,maxResults}})
  if(invokeError){
   let message=invokeError.message||'Business map discovery failed.'
   const context=(invokeError as{context?:unknown}).context
   if(context&&typeof context==='object'&&'json'in context&&typeof(context as Response).json==='function'){try{const payload=await(context as Response).json();if(typeof payload?.error==='string')message=payload.error}catch{/* keep safe error */}}
   throw new Error(message)
  }
  if(!response||response.status!=='ok'||!Array.isArray(response.results))throw new Error(response?.error||'The Maps discovery response was invalid.')
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
  const providerErrors=Array.isArray(response.providerErrors)?response.providerErrors:[]
  const partial=providerErrors.length>0
  const partialError=providerErrors.join(' ')
  const{error:jobUpdateError}=await supabase.from('search_jobs').update({status:'completed',progress:100,businesses_found:rows.length,error_message:partial?('Partial provider results: '+partialError).slice(0,500):null,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  if(jobUpdateError)throw jobUpdateError
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  input.onProgress?.(100)
  return{searchedCount:Number(response.resultCount??candidates.length),candidateCount:candidates.length,savedCount:rows.length,duplicateCount,queries:Array.isArray(response.queries)?response.queries:[],partial,partialError,provider:String(response.provider??'unknown'),providerLabel:String(response.providerLabel??'Business map provider'),providerNote:String(response.note??'')}
 }catch(error){
  const message=error instanceof Error?error.message:'Business discovery failed.'
  const cancelled=message.startsWith('Search cancelled.')
  await supabase.from('search_jobs').update({status:cancelled?'cancelled':'failed',error_message:message.slice(0,500),completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:cancelled?'cancelled':'failed'}).eq('id',project.id).eq('user_id',input.userId)
  throw error
 }
}
export type BusinessAnalysis={status:'ok';leadId:string;model:string;score:number;scoreParts:Record<string,number>;websiteQuality:string;identifiedGaps:string[];recommendedService:string|null;evidenceSummary:string;evidenceCount:number;evidence:{title:string;url:string}[];verificationStatus:string;analyzedAt:string}
export async function enrichBusinessLead(businessLeadId:string):Promise<BusinessAnalysis>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.functions.invoke('lead-enrich-score',{body:{businessLeadId}})
 if(error){let message=error.message||'Could not analyze this business.';const context=(error as {context?:unknown}).context;if(context&&typeof context==='object'&&'json' in context&&typeof(context as Response).json==='function'){try{const p=await(context as Response).json();if(typeof p?.error==='string')message=p.error}catch{/* retain safe error */}}throw new Error(message)}
 if(!data||data.status!=='ok')throw new Error(data?.error||'The analysis response was invalid.')
 return data as BusinessAnalysis
}

export type LeadEvidence={id:string;evidence_type:string;description:string;evidence_url:string|null;observed_at:string}
export async function loadBusinessEvidence(businessLeadId:string):Promise<LeadEvidence[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.from('lead_evidence').select('id,evidence_type,description,evidence_url,observed_at').eq('business_lead_id',businessLeadId).order('observed_at',{ascending:false}).limit(10)
 if(error)throw error
 return (data??[]) as LeadEvidence[]
}
