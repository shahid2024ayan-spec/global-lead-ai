# GlobalLead AI — Python intelligence backend

FastAPI powers discovery and AI qualification. React/Vite is the frontend; Supabase remains authentication, database and CRM storage. The FastAPI app is exposed through the Vercel Python function at `api/index.py`.

## Local run

```bash
pip install -r requirements.txt
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
export GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_KEY
uvicorn backend.app.main:app --reload
```

## Vercel environment variables

Set `GEMINI_API_KEY` as an encrypted server-side environment variable in Vercel. Do not put it in `VITE_*` variables, frontend files, or GitHub. The default model is `gemini-3.8-flash`; override with `GEMINI_MODEL` if needed.

The Python app reads the existing Supabase project URL and publishable key from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` when server-side equivalents are not set.

## API endpoints

- `GET /health` — service/auth/AI configuration status; never returns secrets
- `POST /api/discover/businesses` — public OpenStreetMap business listings
- `POST /api/discover/social` — Google News indexed public pages and separately labelled Remotive job listings
- `POST /api/ai/analyze` — website audit, public evidence collection, business need score, skill-fit score and confidence
- `POST /api/ai/score-social` — public opportunity intent/skill-fit analysis
- `GET /docs` — API documentation

Discovery and AI routes require a valid Supabase access token in `Authorization: Bearer <token>`.

## Qualification rules

- A business listing is only a candidate, not proof of demand.
- Need score and skill-fit score are separate. A good skill match does not mean the business intends to buy.
- Scores must be grounded in website checks and public evidence. Thin evidence produces low confidence and an insufficient-evidence label.
- The website audit checks the fetched HTML, HTTP response, title, meta description, viewport, H1 and image alt attributes. It does not assess visual design or guarantee real-world conversion performance.
- Social results are indexed public pages, not direct platform APIs. Job listings are labeled separately and are not automatically freelance leads.
- Public data coverage and free-provider rate limits vary. The result target is not a guarantee.
- Website fetches reject private/internal destinations and re-check redirects to reduce server-side request forgery risk.
