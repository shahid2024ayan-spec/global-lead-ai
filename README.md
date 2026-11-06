# GlobalLead AI

A mobile-first, evidence-first client and opportunity intelligence platform.

## Module 01 — Foundation & UI/UX
- Responsive React + TypeScript + Vite application shell
- Mobile navigation and dark/light theme
- Dashboard and opportunity search setup

## Module 02 — Backend & Database
- Supabase Auth email/password sign-up, sign-in, session restore, and sign-out
- Private per-user workspaces protected by Row Level Security
- Search project preferences and skill profiles saved to PostgreSQL
- Dashboard counts loaded from the user's actual database rows
- Core schema for businesses, social opportunities, evidence, saved leads, CRM, outreach drafts, search jobs, keywords, and notifications
- All database tables have RLS enabled; browser clients use only a publishable key

## Stack
- React 18 + TypeScript + Vite
- Supabase JS 2.119.0 (pinned)
- PostgreSQL 17 on Supabase
- Vercel deployment target

## Environment
Copy `.env.example` to `.env.local` and set:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase secret/service-role key in frontend environment variables. The publishable key is designed for browser use; RLS remains the data-access boundary.

## Local development
```bash
npm install
npm run dev
npm run build
```

## Database
The applied schema is documented in `supabase/migrations/202611060001_global_lead_ai_core_schema.sql`.
It is intended for a fresh project. Do not run it a second time against the already provisioned project without first converting it into an idempotent migration.

## Project structure
```
src/
  app/App.tsx
  features/
    auth/
    search/
    workspace/
  lib/supabase.ts
  main.tsx
  styles/globals.css
supabase/
  migrations/
```

## Roadmap
1. Foundation & UI/UX
2. Backend & Database
3. API & Data Integration Engine
4. AI Skill Intelligence Engine
5. Global Business Discovery
6. Social Media Opportunity Discovery
7. Lead Enrichment & Verification
8. AI Analysis & Lead Scoring
9. Lead Management & Client Acquisition
10. Testing, Optimization & Deployment

No fabricated leads, fake metrics, or unauthorized scraping. Every future opportunity must be traceable to its source and evidence.
