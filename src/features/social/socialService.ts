import {supabase} from '../../lib/supabase'
export type SocialOpportunity={id:string;platform:string;post_url:string;author_name:string|null;post_text:string;posted_at:string|null;country:string|null;city:string|null;requested_service:string|null;budget_text:string|null;urgency:string;buying_intent:string|null;lead_score:number;score_reason:string|null;verification_status:string;created_at:string}
const platformFor=(url:string)=>{const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');if(host.includes('linkedin.com'))return 'LinkedIn';if(host.includes('facebook.com')||host==='fb.com')return 'Facebook';if(host==='x.com'||host.includes('twitter.com'))return 'X';if(host.includes('threads.net'))return 'Threads';return 'Public community'}
export async function loadSocialOpportunities(userId:string):Promise<SocialOpportunity[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.from('social_opportunities').select('id,platform,post_url,author_name,post_text,posted_at,country,city,requested_service,budget_text,urgency,buying_intent,lead_score,score_reason,verification_status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
 if(error)throw error
 return (data??[]) as SocialOpportunity[]
}
const socialQueries=(skill:string,market:string)=>[
 `public social posts asking for a ${skill} freelancer or agency in ${market}`,
 `public hiring requests and project requests for ${skill} services in ${market}`,
 `people or businesses seeking help with ${skill}, looking for recommendations or providers in ${market}`,
 `public LinkedIn Facebook and X posts requesting ${skill} work, quotes or proposals in ${market}`,
 `businesses looking to outsource ${skill} services or hire a ${skill} specialist in ${market}`
]
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
export async function discoverSocialOpportunities(input:{userId:string;skill:string;market:string;maxResults?:number;onJobCreated?:(id:string)=>void;onProgress?:(progress:number)=>void}){
 if(!supabase)throw new Error('Database connection is not configured.')
 const skill=input.skill.trim(),market=input.market.trim(),maxResults=Math.min(100,Math.max(20,Math.floor(input.maxResults??20)))
 if(skill.length<2||market.length<2)throw new Error('Enter a valid service and target market.')
 const worldwide=market.toLowerCase()==='worldwide',querySet=socialQueries(skill,market).slice(0,Math.ceil(maxResults/20))
 const{data:project,error:projectError}=await supabase.from('search_projects').insert({user_id:input.userId,name:skill+' social demand — '+market,target_scope:worldwide?'worldwide':'country',target_country:worldwide?null:market,source_mode:'social',status:'running',preferences:{skill,market,discovery:'public-social-opportunities',resultLimit:maxResults,querySet}}).select('id').single()
 if(projectError)throw projectError
 const{data:job,error:jobError}=await supabase.from('search_jobs').insert({user_id:input.userId,project_id:project.id,status:'running',progress:2,started_at:new Date().toISOString()}).select('id').single()
 if(jobError){await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw jobError}
 input.onJobCreated?.(job.id)
 let searchedCount=0,candidateCount=0,savedCount=0,duplicateCount=0
 const seen=new Set<string>()
 try{
  const{data:existing,error:existingError}=await supabase.from('social_opportunities').select('post_url').eq('user_id',input.userId)
  if(existingError)throw existingError
  for(const row of existing??[])seen.add(row.post_url)
  let partialError=''
  for(let i=0;i<querySet.length;i++){
   await waitForSocialJob(input.userId,job.id)
   const query=querySet[i]
   const{data:response,error:searchError}=await supabase.functions.invoke('lead-discovery',{body:{query,maxResults:Math.min(20,maxResults-i*20),searchDepth:'basic'}})
   if(searchError){
    let message=searchError.message||'The public search provider failed.'
    const context=(searchError as{context?:unknown}).context
    if(context&&typeof context==='object'&&'json'in context&&typeof(context as Response).json==='function'){try{const payload=await(context as Response).json();if(typeof payload?.error==='string')message=payload.error}catch{/* retain safe message */}}
    if(searchedCount>0){partialError=message;break}
    throw new Error(message)
   }
   if(!response||response.status!=='ok'||!Array.isArray(response.results))throw new Error(response?.error||'The search response was invalid.')
   searchedCount+=response.results.length
   const allowed=response.results.flatMap((raw:unknown)=>{
    if(!raw||typeof raw!=='object')return[]
    const item=raw as Record<string,unknown>
    if(typeof item.url!=='string'||typeof item.content!=='string'||item.content.trim().length<30)return[]
    let parsed:URL
    try{parsed=new URL(item.url)}catch{return[]}
    if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return[]
    const rawHost=parsed.hostname.toLowerCase(),host=rawHost.startsWith('www.')?rawHost.slice(4):rawHost
    const domains=['linkedin.com','facebook.com','fb.com','x.com','twitter.com','threads.net']
    if(!domains.some(domain=>host===domain||host.endsWith('.'+domain)))return[]
    return[{url:item.url,content:item.content,title:typeof item.title==='string'?item.title:'',publishedDate:typeof item.published_date==='string'?item.published_date:null}]
   })
   candidateCount+=allowed.length
   const fresh=allowed.filter(item=>{if(seen.has(item.url))return false;seen.add(item.url);return true})
   duplicateCount+=allowed.length-fresh.length
   const rows=fresh.map(item=>({user_id:input.userId,project_id:project.id,search_job_id:job.id,platform:platformFor(item.url),post_url:item.url,post_text:item.content.trim().slice(0,4000),posted_at:item.publishedDate&&!Number.isNaN(Date.parse(item.publishedDate))?new Date(item.publishedDate).toISOString():null,requested_service:skill,urgency:'unknown',buying_intent:'Potential public request — review the original post before qualification.',lead_score:0,score_reason:'Not scored yet. Buying intent and author must be verified.',verification_status:'unverified'}))
   if(rows.length){const{error}=await supabase.from('social_opportunities').insert(rows);if(error)throw error;savedCount+=rows.length}
   const progress=Math.min(90,Math.round(((i+1)/querySet.length)*90))
   const{error:progressError}=await supabase.from('search_jobs').update({progress,opportunities_found:savedCount}).eq('id',job.id).eq('user_id',input.userId)
   if(progressError)throw progressError
   input.onProgress?.(progress)
  }
  await waitForSocialJob(input.userId,job.id)
  await supabase.from('search_jobs').update({status:'completed',progress:100,opportunities_found:savedCount,error_message:partialError?'Partial results: '+partialError:null,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  input.onProgress?.(100)
  return{searchedCount,candidateCount,savedCount,duplicateCount,queries:querySet,partial:Boolean(partialError),partialError}
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
