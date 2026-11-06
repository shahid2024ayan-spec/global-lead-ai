-- GlobalLead AI core database schema (Module 02)
-- Apply once to a fresh Supabase project.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text,
  proficiency text not null default 'intermediate'
    check (proficiency in ('beginner','intermediate','advanced','expert')),
  created_at timestamptz not null default now(),
  unique (id,user_id), unique (user_id,name)
);

create table public.search_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  target_scope text not null default 'worldwide'
    check (target_scope in ('worldwide','country','city')),
  target_country text,
  target_city text,
  source_mode text not null default 'both'
    check (source_mode in ('businesses','social','both')),
  status text not null default 'draft'
    check (status in ('draft','queued','running','paused','completed','failed','cancelled')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check ((target_scope='worldwide') or
    (target_scope='country' and nullif(trim(target_country),'') is not null) or
    (target_scope='city' and nullif(trim(target_city),'') is not null))
);

create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','running','paused','completed','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  businesses_found integer not null default 0 check (businesses_found >= 0),
  opportunities_found integer not null default 0 check (opportunities_found >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (project_id,user_id) references public.search_projects(id,user_id) on delete cascade
);

create table public.business_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  search_job_id uuid,
  business_name text not null,
  website_url text,
  public_email text,
  public_phone text,
  country text,
  city text,
  address text,
  category text,
  source_name text not null,
  source_url text,
  website_quality text check (website_quality in ('good','needs_improvement','missing','unknown')),
  identified_gaps jsonb not null default '[]'::jsonb,
  recommended_service text,
  lead_score smallint not null default 0 check (lead_score between 0 and 100),
  score_reason text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','partially_verified','verified','rejected')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (project_id,user_id) references public.search_projects(id,user_id) on delete cascade,
  foreign key (search_job_id,user_id) references public.search_jobs(id,user_id) on delete cascade
);

create table public.social_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  search_job_id uuid,
  platform text not null,
  post_url text not null,
  author_name text,
  author_profile_url text,
  post_text text not null,
  posted_at timestamptz,
  country text,
  city text,
  public_contact text,
  requested_service text,
  budget_text text,
  urgency text check (urgency in ('low','medium','high','unknown')),
  buying_intent text,
  lead_score smallint not null default 0 check (lead_score between 0 and 100),
  score_reason text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','partially_verified','verified','rejected')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id), unique (user_id,post_url),
  foreign key (project_id,user_id) references public.search_projects(id,user_id) on delete cascade,
  foreign key (search_job_id,user_id) references public.search_jobs(id,user_id) on delete cascade
);

create table public.lead_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_lead_id uuid,
  social_opportunity_id uuid,
  evidence_type text not null,
  description text not null,
  evidence_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((business_lead_id is not null)::integer + (social_opportunity_id is not null)::integer = 1),
  foreign key (business_lead_id,user_id) references public.business_leads(id,user_id) on delete cascade,
  foreign key (social_opportunity_id,user_id) references public.social_opportunities(id,user_id) on delete cascade
);

create table public.saved_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_lead_id uuid,
  social_opportunity_id uuid,
  crm_status text not null default 'new'
    check (crm_status in ('new','qualified','contacted','replied','interested','negotiation','won','lost')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  notes text,
  deal_value numeric(12,2) check (deal_value is null or deal_value >= 0),
  currency char(3),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check ((business_lead_id is not null)::integer + (social_opportunity_id is not null)::integer = 1),
  foreign key (business_lead_id,user_id) references public.business_leads(id,user_id) on delete cascade,
  foreign key (social_opportunity_id,user_id) references public.social_opportunities(id,user_id) on delete cascade
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_lead_id uuid not null,
  activity_type text not null
    check (activity_type in ('note','call','email','message','meeting','status_change','follow_up')),
  body text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (saved_lead_id,user_id) references public.saved_leads(id,user_id) on delete cascade
);

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_lead_id uuid not null,
  channel text not null check (channel in ('email','whatsapp','linkedin','instagram','proposal','other')),
  subject text,
  message_body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (saved_lead_id,user_id) references public.saved_leads(id,user_id) on delete cascade
);

create table public.search_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  keyword text not null,
  keyword_type text not null default 'primary'
    check (keyword_type in ('primary','synonym','related_service','intent','language_variant')),
  language_code text,
  created_at timestamptz not null default now(),
  foreign key (project_id,user_id) references public.search_projects(id,user_id) on delete cascade,
  unique (project_id,keyword)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  notification_type text not null default 'info'
    check (notification_type in ('info','success','warning','error')),
  read_at timestamptz,
  action_url text,
  created_at timestamptz not null default now()
);

create index user_skills_user_idx on public.user_skills(user_id);
create index search_projects_user_created_idx on public.search_projects(user_id,created_at desc);
create index search_jobs_user_status_idx on public.search_jobs(user_id,status);
create index search_jobs_project_owner_idx on public.search_jobs(project_id,user_id);
create index business_leads_user_score_idx on public.business_leads(user_id,lead_score desc);
create index business_leads_project_owner_idx on public.business_leads(project_id,user_id);
create index business_leads_job_owner_idx on public.business_leads(search_job_id,user_id);
create index social_opportunities_user_score_idx on public.social_opportunities(user_id,lead_score desc);
create index social_opportunities_project_owner_idx on public.social_opportunities(project_id,user_id);
create index social_opportunities_job_owner_idx on public.social_opportunities(search_job_id,user_id);
create index lead_evidence_business_owner_idx on public.lead_evidence(business_lead_id,user_id);
create index lead_evidence_social_owner_idx on public.lead_evidence(social_opportunity_id,user_id);
create index saved_leads_user_status_idx on public.saved_leads(user_id,crm_status,created_at desc);
create index saved_leads_business_owner_idx on public.saved_leads(business_lead_id,user_id);
create index saved_leads_social_owner_idx on public.saved_leads(social_opportunity_id,user_id);
create index crm_activities_lead_owner_idx on public.crm_activities(saved_lead_id,user_id);
create index outreach_messages_lead_owner_idx on public.outreach_messages(saved_lead_id,user_id);
create index search_keywords_project_owner_idx on public.search_keywords(project_id,user_id);
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger search_projects_updated_at before update on public.search_projects for each row execute function public.set_updated_at();
create trigger search_jobs_updated_at before update on public.search_jobs for each row execute function public.set_updated_at();
create trigger business_leads_updated_at before update on public.business_leads for each row execute function public.set_updated_at();
create trigger social_opportunities_updated_at before update on public.social_opportunities for each row execute function public.set_updated_at();
create trigger saved_leads_updated_at before update on public.saved_leads for each row execute function public.set_updated_at();
create trigger outreach_messages_updated_at before update on public.outreach_messages for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_skills enable row level security;
alter table public.search_projects enable row level security;
alter table public.search_jobs enable row level security;
alter table public.business_leads enable row level security;
alter table public.social_opportunities enable row level security;
alter table public.lead_evidence enable row level security;
alter table public.saved_leads enable row level security;
alter table public.crm_activities enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.search_keywords enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_skills_all_own on public.user_skills for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy search_projects_all_own on public.search_projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy search_jobs_all_own on public.search_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy business_leads_all_own on public.business_leads for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy social_opportunities_all_own on public.social_opportunities for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy lead_evidence_all_own on public.lead_evidence for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_leads_all_own on public.saved_leads for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy crm_activities_all_own on public.crm_activities for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy outreach_messages_all_own on public.outreach_messages for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy search_keywords_all_own on public.search_keywords for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notifications_select_own on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy notifications_update_own on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.user_skills,public.search_projects,public.search_jobs,
  public.business_leads,public.social_opportunities,public.lead_evidence,public.saved_leads,
  public.crm_activities,public.outreach_messages,public.search_keywords,public.notifications to authenticated;
revoke all on function public.set_updated_at() from public,anon,authenticated;
