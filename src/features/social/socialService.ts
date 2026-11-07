import {supabase} from '../../lib/supabase'
import {pythonApi} from '../../lib/pythonApi'
export const SOCIAL_QUERY_TEMPLATE_CAPACITY=15
export type SocialOpportunity={id:string;platform:string;post_url:string;author_name:string|null;post_text:string;posted_at:string|null;country:string|null;city:string|null;requested_service:string|null;budget_text:string|null;urgency:string;buying_intent:string|null;lead_score:number;score_reason:string|null;verification_status:string;created_at:string}
export async function loadSocialOpportunities(userId:string):Promise<SocialOpportunity[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.from('social_opportunities').select('id,platform,post_url,author_name,post_text,posted_at,country,city,requested_service,budget_text,urgency,buying_intent,lead_score,score_reason,verification_status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
 if(error)throw error
 return (data??[]) as SocialOpportunity[]
}
async function waitForSocialJob(userId:string,jobId:string){
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
export async function discoverSocialOpportunities(input:{userId:string;skill:string;country:string;city?:string;maxResults?:number;onJobCreated?:(id:string)=>void;onProgress?:(progress:number)=>void}){
 if(!supabase)throw new Error('Database connection is not configured.')
 const skill=input.skill.trim(),country=input.country.trim(),city=(input.city??'').trim(),market=city?city+', '+country:country,maxResults=Math.min(100,Math.max(1,Math.floor(input.maxResults??100)))
 if(skill.length<2||country.length<2)throw new Error('Enter a valid service and country.')
 const{data:project,error:projectError}=await supabase.from('search_projects').insert({user_id:input.userId,name:skill+' social demand — '+market,target_scope:city?'city':'country',target_country:country,target_city:city||null,source_mode:'social',status:'running',preferences:{skill,country,city:city||null,market,discovery:'python-public-social-opportunities',resultLimit:maxResults}}).select('id').single()
 if(projectError)throw projectError
 const{data:job,error:jobError}=await supabase.from('search_jobs').insert({user_id:input.userId,project_id:project.id,status:'running',progress:5,started_at:new Date().toISOString()}).select('id').single()
 if(jobError){await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw jobError}
 input.onJobCreated?.(job.id);input.onProgress?.(10)
 try{
  await waitForSocialJob(input.userId,job.id)
  const response=await pythonApi<{provider:string;providerLabel:string;searchedCount:number;results:Record<string,unknown>[];partial:boolean;partialError:string;queries:string[];providerNote:string}>('/api/discover/social',{skill,country,city:city||null,maxResults})
  input.onProgress?.(65)
  const{data:existing,error:existingError}=await supabase.from('social_opportunities').select('post_url').eq('user_id',input.userId)
  if(existingError)throw existingError
  const seen=new Set((existing??[]).map(row=>row.post_url))
  const candidates=response.results.filter(item=>typeof item.post_url==='string'&&typeof item.post_text==='string'&&String(item.post_text).trim().length>10)
  const fresh=candidates.filter(item=>{const url=String(item.post_url);if(seen.has(url))return false;seen.add(url);return true})
  const duplicateCount=candidates.length-fresh.length
  const rows=fresh.slice(0,maxResults).map(item=>({
   user_id:input.userId,project_id:project.id,search_job_id:job.id,
   platform:String(item.platform??'Public web'),post_url:String(item.post_url),
   author_name:typeof item.author_name==='string'?item.author_name:null,
   post_text:String(item.post_text).slice(0,4000),
   posted_at:typeof item.posted_at==='string'&&!Number.isNaN(Date.parse(item.posted_at))?new Date(item.posted_at).toISOString():null,
   country:typeof item.country==='string'?item.country:country,
   city:typeof item.city==='string'?item.city:(city||null),
   requested_service:skill,
   budget_text:typeof item.budget_text==='string'?item.budget_text:null,
   urgency:String(item.urgency??'unknown'),
   buying_intent:String(item.buying_intent??'unverified'),
   lead_score:0,
   score_reason:String(item.score_reason??'Not scored. Review original source before qualification.'),
   verification_status:'unverified'
  }))
  if(rows.length){const{error}=await supabase.from('social_opportunities').insert(rows);if(error)throw error}
  input.onProgress?.(90)
  const partial=Boolean(response.partial),partialError=String(response.partialError??'')
  const{error:jobUpdateError}=await supabase.from('search_jobs').update({status:'completed',progress:100,opportunities_found:rows.length,error_message:partial?('Partial provider results: '+partialError).slice(0,500):null,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  if(jobUpdateError)throw jobUpdateError
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  input.onProgress?.(100)
  return{searchedCount:Number(response.searchedCount??0),candidateCount:candidates.length,savedCount:rows.length,duplicateCount,queries:Array.isArray(response.queries)?response.queries:[],partial,partialError,templateLibrarySize:SOCIAL_QUERY_TEMPLATE_CAPACITY,provider:String(response.provider??'public-rss'),providerNote:String(response.providerNote??'')}
 }catch(error){
  const message=error instanceof Error?error.message:'Social opportunity discovery failed.'
  const cancelled=message.startsWith('Search cancelled.')
  await supabase.from('search_jobs').update({status:cancelled?'cancelled':'failed',error_message:message.slice(0,500),completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:cancelled?'cancelled':'failed'}).eq('id',project.id).eq('user_id',input.userId)
  throw error
 }
}
export async function scoreSocialOpportunity(socialOpportunityId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.functions.invoke('social-opportunity-score',{body:{socialOpportunityId}})
 if(error){let message=error.message||'Could not score this opportunity.';const context=(error as {context?:unknown}).context;if(context&&typeof context==='object'&&'json' in context&&typeof(context as Response).json==='function'){try{const p=await(context as Response).json();if(typeof p?.error==='string')message=p.error}catch{/* keep safe error */}}throw new Error(message)}
 if(!data||data.status!=='ok')throw new Error(data?.error||'Scoring response was invalid.')
 return data as {status:'ok';score:number;scoreParts:Record<string,number>;explicitBuyingIntent:boolean;urgency:string;budgetText:string|null;scoreReason:string;postedDaysAgo:number|null}
}
