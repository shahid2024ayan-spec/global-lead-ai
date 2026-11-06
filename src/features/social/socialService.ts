import {supabase} from '../../lib/supabase'
export type SocialOpportunity={id:string;platform:string;post_url:string;author_name:string|null;post_text:string;posted_at:string|null;country:string|null;city:string|null;requested_service:string|null;budget_text:string|null;urgency:string;buying_intent:string|null;lead_score:number;verification_status:string;created_at:string}
const platformFor=(url:string)=>{const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');if(host.includes('linkedin.com'))return 'LinkedIn';if(host.includes('facebook.com')||host==='fb.com')return 'Facebook';if(host==='x.com'||host.includes('twitter.com'))return 'X';if(host.includes('threads.net'))return 'Threads';return 'Public community'}
export async function loadSocialOpportunities(userId:string):Promise<SocialOpportunity[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.from('social_opportunities').select('id,platform,post_url,author_name,post_text,posted_at,country,city,requested_service,budget_text,urgency,buying_intent,lead_score,verification_status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
 if(error)throw error
 return (data??[]) as SocialOpportunity[]
}
export async function discoverSocialOpportunities(input:{userId:string;skill:string;market:string;maxResults?:number}){
 if(!supabase)throw new Error('Database connection is not configured.')
 const skill=input.skill.trim(),market=input.market.trim(),maxResults=Math.min(20,Math.max(1,input.maxResults??20))
 if(skill.length<2||market.length<2)throw new Error('Enter a valid service and target market.')
 const worldwide=market.toLowerCase()==='worldwide'
 const {data:project,error:projectError}=await supabase.from('search_projects').insert({user_id:input.userId,name:`${skill} social demand — ${market}`,target_scope:worldwide?'worldwide':'country',target_country:worldwide?null:market,source_mode:'social',status:'running',preferences:{skill,market,discovery:'public-social-opportunities'}}).select('id').single()
 if(projectError)throw projectError
 const {data:job,error:jobError}=await supabase.from('search_jobs').insert({user_id:input.userId,project_id:project.id,status:'running',progress:5,started_at:new Date().toISOString()}).select('id').single()
 if(jobError){await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw jobError}
 try{
  const query=`public posts from people looking for or requesting ${skill} freelancer, agency or service provider in ${market}; opportunities, hiring requests and project requests on LinkedIn Facebook X social media`
  const {data:response,error:searchError}=await supabase.functions.invoke('lead-discovery',{body:{query,maxResults,searchDepth:'basic'}})
  if(searchError){let message=searchError.message||'The public search provider failed.';const context=(searchError as {context?:unknown}).context;if(context&&typeof context==='object'&&'json' in context&&typeof (context as Response).json==='function'){try{const p=await (context as Response).json();if(typeof p?.error==='string')message=p.error}catch{/* retain safe message */}}throw new Error(message)}
  if(!response||response.status!=='ok'||!Array.isArray(response.results))throw new Error(response?.error||'The search response was invalid.')
  const allowed=response.results.flatMap((raw:unknown)=>{
   if(!raw||typeof raw!=='object')return[]
   const item=raw as Record<string,unknown>
   if(typeof item.url!=='string'||typeof item.content!=='string'||item.content.trim().length<30)return[]
   let parsed:URL
   try{parsed=new URL(item.url)}catch{return[]}
   if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return[]
   const rawHost=parsed.hostname.toLowerCase()
   const host=rawHost.startsWith('www.')?rawHost.slice(4):rawHost
   const domains=['linkedin.com','facebook.com','fb.com','x.com','twitter.com','threads.net']
   if(!domains.some(domain=>host===domain||host.endsWith('.'+domain)))return[]
   return[{url:item.url,content:item.content,title:typeof item.title==='string'?item.title:'',publishedDate:typeof item.published_date==='string'?item.published_date:null}]
  })
  const urls=[...new Set(allowed.map((item:{url:string})=>item.url))]
  let existing:string[]=[]
  if(urls.length){const {data,error}=await supabase.from('social_opportunities').select('post_url').eq('user_id',input.userId).in('post_url',urls);if(error)throw error;existing=(data??[]).map(row=>row.post_url)}
  const known=new Set(existing),fresh=allowed.filter((item:{url:string})=>!known.has(item.url))
  const rows=fresh.map((item:{title?:string;url:string;content:string;publishedDate?:string|null})=>({user_id:input.userId,project_id:project.id,search_job_id:job.id,platform:platformFor(item.url),post_url:item.url,post_text:item.content.trim().slice(0,4000),posted_at:item.publishedDate&& !Number.isNaN(Date.parse(item.publishedDate))?new Date(item.publishedDate).toISOString():null,requested_service:skill,urgency:'unknown',buying_intent:'Potential public request — review the original post before qualification.',lead_score:0,score_reason:'Not scored yet. Buying intent and author must be verified.',verification_status:'unverified'}))
  if(rows.length){const {error}=await supabase.from('social_opportunities').insert(rows);if(error)throw error}
  await supabase.from('search_jobs').update({status:'completed',progress:100,opportunities_found:rows.length,completed_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',input.userId)
  await supabase.from('search_projects').update({status:'completed'}).eq('id',project.id).eq('user_id',input.userId)
  return{searchedCount:response.results.length as number,candidateCount:allowed.length,savedCount:rows.length,duplicateCount:allowed.length-rows.length,query:response.query as string,searchedAt:response.searchedAt as string}
 }catch(error){const message=error instanceof Error?error.message:'Social opportunity discovery failed.';await supabase.from('search_jobs').update({status:'failed',error_message:message.slice(0,500)}).eq('id',job.id).eq('user_id',input.userId);await supabase.from('search_projects').update({status:'failed'}).eq('id',project.id).eq('user_id',input.userId);throw error}
}
export async function scoreSocialOpportunity(socialOpportunityId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const {data,error}=await supabase.functions.invoke('social-opportunity-score',{body:{socialOpportunityId}})
 if(error){let message=error.message||'Could not score this opportunity.';const context=(error as {context?:unknown}).context;if(context&&typeof context==='object'&&'json' in context&&typeof(context as Response).json==='function'){try{const p=await(context as Response).json();if(typeof p?.error==='string')message=p.error}catch{/* keep safe error */}}throw new Error(message)}
 if(!data||data.status!=='ok')throw new Error(data?.error||'Scoring response was invalid.')
 return data as {status:'ok';score:number;scoreParts:Record<string,number>;explicitBuyingIntent:boolean;urgency:string;budgetText:string|null;scoreReason:string;postedDaysAgo:number|null}
}
