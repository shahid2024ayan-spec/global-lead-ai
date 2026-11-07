import{supabase}from'../../lib/supabase'

export type CRMLead={
 id:string;crm_status:string;priority:string;notes:string|null;deal_value:number|null;currency:string|null;next_follow_up_at:string|null;created_at:string;
 business_leads:{business_name:string;website_url:string|null;source_url:string|null}|null;
 social_opportunities:{platform:string;post_url:string;post_text:string;requested_service:string|null}|null
}
export type CRMActivity={id:string;saved_lead_id:string;activity_type:string;body:string;occurred_at:string}
export async function loadCRMLeads(userId:string):Promise<CRMLead[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data,error}=await supabase.from('saved_leads').select('id,crm_status,priority,notes,deal_value,currency,next_follow_up_at,created_at,business_leads(business_name,website_url,source_url),social_opportunities(platform,post_url,post_text,requested_service)').eq('user_id',userId).order('created_at',{ascending:false}).limit(200)
 if(error)throw error
 return(data??[]) as unknown as CRMLead[]
}
export async function loadCRMActivities(userId:string,leadIds:string[]):Promise<CRMActivity[]>{
 if(!supabase)throw new Error('Database connection is not configured.')
 if(!leadIds.length)return[]
 const{data,error}=await supabase.from('crm_activities').select('id,saved_lead_id,activity_type,body,occurred_at').eq('user_id',userId).in('saved_lead_id',leadIds).order('occurred_at',{ascending:false}).limit(500)
 if(error)throw error
 return(data??[]) as CRMActivity[]
}
export async function addCRMActivity(userId:string,leadId:string,activityType:string,body:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const allowed=['note','call','email','message','meeting','follow_up']
 if(!allowed.includes(activityType))throw new Error('Choose a valid activity type.')
 const clean=body.trim()
 if(!clean||clean.length>4000)throw new Error('Activity must contain 1–4,000 characters.')
 const{error}=await supabase.from('crm_activities').insert({user_id:userId,saved_lead_id:leadId,activity_type:activityType,body:clean})
 if(error)throw error
}
export async function saveBusinessToCrm(userId:string,businessLeadId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data:existing,error:lookupError}=await supabase.from('saved_leads').select('id').eq('user_id',userId).eq('business_lead_id',businessLeadId).maybeSingle()
 if(lookupError)throw lookupError
 if(existing)return false
 const{error}=await supabase.from('saved_leads').insert({user_id:userId,business_lead_id:businessLeadId,crm_status:'new'})
 if(error)throw error
 return true
}
export async function saveSocialToCrm(userId:string,socialOpportunityId:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data:existing,error:lookupError}=await supabase.from('saved_leads').select('id').eq('user_id',userId).eq('social_opportunity_id',socialOpportunityId).maybeSingle()
 if(lookupError)throw lookupError
 if(existing)return false
 const{error}=await supabase.from('saved_leads').insert({user_id:userId,social_opportunity_id:socialOpportunityId,crm_status:'new'})
 if(error)throw error
 return true
}
export async function updateCRMLead(userId:string,id:string,updates:{crm_status?:string;priority?:string;notes?:string;deal_value?:number|null;currency?:string|null;next_follow_up_at?:string|null},previousStatus?:string){
 if(!supabase)throw new Error('Database connection is not configured.')
 const{error}=await supabase.from('saved_leads').update(updates).eq('id',id).eq('user_id',userId)
 if(error)throw error
 if(updates.crm_status&&previousStatus&&updates.crm_status!==previousStatus){
  const{error:activityError}=await supabase.from('crm_activities').insert({user_id:userId,saved_lead_id:id,activity_type:'status_change',body:`Pipeline stage changed from ${previousStatus} to ${updates.crm_status}.`})
  if(activityError)throw activityError
 }
 if(Object.prototype.hasOwnProperty.call(updates,'next_follow_up_at')&&updates.next_follow_up_at){
  const when=new Date(updates.next_follow_up_at)
  if(!Number.isNaN(when.getTime())&&when.getTime()>Date.now()){
   const{error:activityError}=await supabase.from('crm_activities').insert({user_id:userId,saved_lead_id:id,activity_type:'follow_up',body:`Follow-up scheduled for ${when.toLocaleString()}.`})
   if(activityError)throw activityError
  }
 }
}
export type OutreachDraft={status:'ok';draftId:string;channel:string;subject:string|null;message:string;model:string;createdAt:string;note:string}
export async function generateOutreachDraft(savedLeadId:string,channel:string,tone='professional'):Promise<OutreachDraft>{
 if(!supabase)throw new Error('Database connection is not configured.')
 const{data,error}=await supabase.functions.invoke('outreach-draft',{body:{savedLeadId,channel,tone}})
 if(error){let message=error.message||'Could not generate outreach draft.';const context=(error as{context?:unknown}).context;if(context&&typeof context==='object'&&'json'in context&&typeof(context as Response).json==='function'){try{const p=await(context as Response).json();if(typeof p?.error==='string')message=p.error}catch{/* keep safe message */}}throw new Error(message)}
 if(!data||data.status!=='ok')throw new Error(data?.error||'Draft response was invalid.')
 return data as OutreachDraft
}
