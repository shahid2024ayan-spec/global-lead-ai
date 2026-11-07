import { supabase } from '../../lib/supabase'
export type BusinessLead = { id:string; business_name:string; website_url:string|null; country:string|null; city:string|null; category:string|null; source_name:string; source_url:string|null; lead_score:number; verification_status:string; created_at:string; website_quality:string|null; identified_gaps:string[]; recommended_service:string|null; score_reason:string|null; last_verified_at:string|null }
export async function loadBusinessLeads(userId:string):Promise<BusinessLead[]> {
  if(!supabase) throw new Error('Database connection is not configured.')
  const {data,error}=await supabase.from('business_leads').select('id,business_name,website_url,country,city,category,source_name,source_url,lead_score,verification_status,created_at,website_quality,identified_gaps,recommended_service,score_reason,last_verified_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
  if(error) throw error
  return (data??[]) as BusinessLead[]
}
export type DiscoveryCallbacks={onJobCreated?:(id:string)=>void;onProgress?:(progress:number)=>void}
const businessQueries=(skill:string,market:string)=>[
 `companies and businesses offering ${skill} services, official websites and service providers in ${market}`,
 `businesses that may need ${skill} services, website redesign, automation or professional support in ${market}`,
 `agencies, companies and small businesses hiring or outsourcing ${skill} freelancers in ${market}`,
 `official company websites and business directories for ${skill} providers in ${market}`,
 `businesses with poor websites or digital presence that could benefit from ${skill} in ${market}`
]
async function waitForJob(userId:string,jobId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 while(true){
  const{data,error}=await supabase.from('search_jobs').select('status').eq('id',jobId).eq('user_id',userId).single()
  if(error)throw error
  if(data.status==='cancelled')throw new Error('Search cancelled. Results saved before cancellation remain in your workspace.')
  if(data.status==='paused'){await new Promise(resolve=>setTimeout(resolve,1200));continue}
  if(data.status!=='running')throw new Error('Search job is no longer running.')
  return
 }
}
export async function discoverBusinesses(input:{userId:string;skill:string;market:string;maxResults?:number}&DiscoveryCallbacks){
 if(!supabase)throw new Error('Database connection is not configured.')
 const skill=input.skill.trim(),market=input.market.trim(),maxResults=Math.min(100,Math.max(20,Math.floor(input.maxResults??20)))
 if(skill.length<2||market.length<2)throw new Error('Enter a valid service and target market.')
 const worldwide=market.toLowerCase()==='worldwide',querySet=businessQueries(skill,market).slice(0,Math.ceil(maxResults/20))
 const{data:project,error:projectError}=await supabase.from('search_projects').insert({user_id:input.userId,name:skill+' — '+market,target_scope:worldwide?'worldwide':'country',target_country:worldwide?null:market,source_mode:'businesses',status:'running',preferences:{skill,market,discovery:'businesses',resultLimit:maxResults,querySet}}).select('id').single()
 if(projectError)throw projectError
 const{data:job,error:jobError}=await supabase.from('search_jobs').insert({user_id:input.userId,project_id:project.id,status:'running',progress:2,started_at:new Date().toISOString()}).select('id').single()
 if(jobError){await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw jobError}
 input.onJobCreated?.(job.id)
 let searchedCount=0,candidateCount=0,savedCount=0,duplicateCount=0
 const seen=new Set<string>()
 try{
  const{data:existing,error:existingError}=await supabase.from('business_leads').select('source_url').eq('user_id',input.userId)
  if(existingError)throw existingError
  for(const row of existing??[])if(row.source_url)seen.add(row.source_url)
  let partialError=''
  for(let i=0;i<querySet.length;i++){
   await waitForJob(input.userId,job.id)
   const query=querySet[i]
   const{data:response,error:searchError}=await supabase.functions.invoke('lead-discovery',{body:{query,maxResults:Math.min(20,maxResults-i*20),searchDepth:'basic'}})
   if(searchError){
    let message=searchError.message||'The public search provider failed.'
    const context=(searchError as{context?:unknown}).context
    if(context&&typeof context==='object'&&'json'in context&&typeof(context as Response).json==='function'){try{const payload=await(context as Response).json();if(typeof payload?.error==='string')message=payload.error}catch{/* keep safe message */}}
    if(searchedCount>0){partialError=message;break}
    throw new Error(message)
   }
   if(!response||response.status!=='ok'||!Array.isArray(response.results))throw new Error(response?.error||'The search response was invalid.')
   searchedCount+=response.results.length
   const candidates=response.results.filter((item:{title?:unknown;url?:unknown})=>typeof item.title==='string'&&item.title.trim().length>1&&typeof item.url==='string'&&/^https?:\/\//i.test(item.url))
   candidateCount+=candidates.length
   const fresh=candidates.filter((item:{url:string})=>{if(seen.has(item.url))return false;seen.add(item.url);return true})
   duplicateCount+=candidates.length-fresh.length
   const rows=fresh.map((item:{title:string;url:string})=>({user_id:input.userId,project_id:project.id,search_job_id:job.id,business_name:item.title.trim().slice(0,240),website_url:item.url,category:skill,source_name:'Tavily public web index',source_url:item.url,lead_score:0,score_reason:'Not scored yet. Requires verification and evidence review.',verification_status:'unverified'}))
   if(rows.length){const{error}=await supabase.from('business_leads').insert(rows);if(error)throw error;savedCount+=rows.length}
   const progress=Math.min(90,Math.round(((i+1)/querySet.length)*90))
   const{error:progressError}=await supabase.from('search_jobs').update({progress,businesses_found:savedCount}).eq('id',job.id).eq('user_id',input.userId)
   if(progressError)throw progressError
   input.onProgress?.(progress)
  }
  await waitForJob(input.userId,job.id)
  const finalStatus=partialError?'completed':'completed'
  await supabase.from('search_jobs').update({status:finalStatus,progress:100,businesses_found:savedCount,error_message:partialError?'Partial results: '+partialError:null,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  input.onProgress?.(100)
  return{searchedCount,candidateCount,savedCount,duplicateCount,queries:querySet,partial:Boolean(partialError),partialError}
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
