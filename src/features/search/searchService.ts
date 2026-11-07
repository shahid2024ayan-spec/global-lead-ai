import { supabase } from '../../lib/supabase'

export type SearchSetup = {
  userId: string
  skill: string
  region: string
  source: string
}

export async function saveSearchSetup({ userId, skill, region, source }: SearchSetup) {
  if (!supabase) throw new Error('Database connection is not configured.')

  const targetScope = region === 'Worldwide' ? 'worldwide' : 'country'
  const projectName = `${skill} — ${region}`
  const { data, error } = await supabase.from('search_projects').insert({
    user_id: userId,
    name: projectName,
    target_scope: targetScope,
    target_country: targetScope === 'country' ? region : null,
    source_mode: source === 'Both' ? 'both' : source === 'Businesses' ? 'businesses' : 'social',
    preferences: { skill },
  }).select('id,name,status,created_at').single()

  if (error) throw error

  const { error: skillError } = await supabase.from('user_skills').upsert({
    user_id: userId,
    name: skill,
  }, { onConflict: 'user_id,name', ignoreDuplicates: true })

  if (skillError) console.error('Skill preference save failed:', skillError.message)
  return data
}

export async function setSearchJobStatus(userId:string,jobId:string,status:'running'|'paused'|'cancelled'){
 if(!supabase)throw new Error('Database connection is not configured.')
 const updates:Record<string,unknown>={status}
 if(status==='cancelled')updates.completed_at=new Date().toISOString()
 const{error}=await supabase.from('search_jobs').update(updates).eq('id',jobId).eq('user_id',userId)
 if(error)throw error
}
