# GlobalLead AI — Python backend

FastAPI backend for free-first discovery. React/Vite remains the frontend, Supabase remains authentication/database, and Render hosts this API.

## Local run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
uvicorn app.main:app --reload
```

## Render environment

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optionally `GEMINI_API_KEY` in Render's Environment settings. `GEMINI_MODEL` defaults to `gemini-3.6-flash`. Never commit API keys or put them in VITE_ variables.

## Endpoints

- `GET /health` — deployment health, no secrets returned
- `POST /api/discover/businesses` — OpenStreetMap/Nominatim discovery
- `POST /api/discover/social` — Google News RSS indexed pages + Remotive jobs
- `POST /api/ai/analyze` — optional Gemini analysis
- `GET /docs` — interactive API docs

Discovery routes require a valid Supabase access token in `Authorization: Bearer <token>`. Nominatim calls are deliberately rate-limited. The free public providers do not guarantee 100 results. Social search is indexed public content, not direct LinkedIn/Facebook/Instagram APIs. Results remain unverified until reviewed.
