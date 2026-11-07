import { supabase } from '../../lib/supabase'

export type WorkspaceCounts={businesses:number;opportunities:number;savedLeads:number;pipelineValue:string}

export async function loadWorkspaceCounts(userId:string):Promise<WorkspaceCounts>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const [businesses,opportunities,savedLeads,deals]=await Promise.all([
  supabase.from('business_leads').select('id',{count:'exact',head:true}).eq('user_id',userId),
  supabase.from('social_opportunities').select('id',{count:'exact',head:true}).eq('user_id',userId),
  supabase.from('saved_leads').select('id',{count:'exact',head:true}).eq('user_id',userId),
  supabase.from('saved_leads').select('deal_value,currency').eq('user_id',userId)
 ])
 const failure=businesses.error??opportunities.error??savedLeads.error??deals.error
 if(failure)throw failure
 const totals=new Map<string,number>()
 for(const row of deals.data??[]){
  if(row.deal_value===null||row.deal_value===undefined)continue
  const currency=(row.currency||'Unspecified').trim()
  totals.set(currency,(totals.get(currency)||0)+Number(row.deal_value))
 }
 const pipelineValue=totals.size?[...totals.entries()].map(([currency,value])=>currency+' '+value.toLocaleString(undefined,{maximumFractionDigits:2})).join(' · '):'—'
 return{businesses:businesses.count??0,opportunities:opportunities.count??0,savedLeads:savedLeads.count??0,pipelineValue}
}

export type IntelligenceRecord={label:string;businesses:number;opportunities:number;averageScore:number}
export type GlobalIntelligenceData={businesses:number;opportunities:number;partiallyVerified:number;averageBusinessScore:number;averageSocialScore:number;countries:IntelligenceRecord[];services:IntelligenceRecord[];updatedAt:string}
export async function loadGlobalIntelligence(userId:string):Promise<GlobalIntelligenceData>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const [b,s]=await Promise.all([
  supabase.from('business_leads').select('country,category,lead_score,verification_status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(500),
  supabase.from('social_opportunities').select('country,requested_service,lead_score,verification_status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(500)
 ])
 if(b.error)throw b.error
 if(s.error)throw s.error
 const businesses=b.data??[],social=s.data??[]
 const aggregate=(key:(row:{country:string|null;category?:string|null;requested_service?:string|null;lead_score:number})=>string|null|undefined):IntelligenceRecord[]=>{
  const groups=new Map<string,{businesses:number;opportunities:number;score:number;scored:number}>()
  for(const row of businesses){const label=key(row)?.trim()||'Not specified';const item=groups.get(label)||{businesses:0,opportunities:0,score:0,scored:0};item.businesses++;item.score+=row.lead_score;item.scored++;groups.set(label,item)}
  for(const row of social){const label=key(row)?.trim()||'Not specified';const item=groups.get(label)||{businesses:0,opportunities:0,score:0,scored:0};item.opportunities++;item.score+=row.lead_score;item.scored++;groups.set(label,item)}
  return[...groups.entries()].map(([label,v])=>({label,businesses:v.businesses,opportunities:v.opportunities,averageScore:v.scored?Math.round(v.score/v.scored):0})).sort((a,b)=>(b.businesses+b.opportunities)-(a.businesses+a.opportunities)).slice(0,10)
 }
 const bs=businesses.map(x=>x.lead_score).filter(x=>x>0),ss=social.map(x=>x.lead_score).filter(x=>x>0)
 return{businesses:businesses.length,opportunities:social.length,partiallyVerified:[...businesses,...social].filter(x=>x.verification_status==='partially_verified'||x.verification_status==='verified').length,averageBusinessScore:bs.length?Math.round(bs.reduce((a,c)=>a+c,0)/bs.length):0,averageSocialScore:ss.length?Math.round(ss.reduce((a,c)=>a+c,0)/ss.length):0,countries:aggregate(row=>row.country),services:aggregate(row=>row.category||row.requested_service),updatedAt:new Date().toISOString()}
}

export type RecentSearchJob={id:string;status:string;progress:number;businesses_found:number;opportunities_found:number;error_message:string|null;created_at:string;started_at:string|null;completed_at:string|null;search_projects:{name:string;source_mode:string;target_country:string|null;target_city:string|null}|null}
export async function loadRecentSearchJobs(userId:string):Promise<RecentSearchJob[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data,error}=await supabase.from('search_jobs').select('id,status,progress,businesses_found,opportunities_found,error_message,created_at,started_at,completed_at,search_projects(name,source_mode,target_country,target_city)').eq('user_id',userId).order('created_at',{ascending:false}).limit(20)
 if(error)throw error
 return(data??[]) as unknown as RecentSearchJob[]
}
