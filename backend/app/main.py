from typing import Literal
import requests
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .config import get_settings
from .providers import search_businesses, search_social

settings = get_settings()
app = FastAPI(title="GlobalLead AI Python API", version="1.0.0", description="Free-first discovery and intelligence backend")
origins = [x.strip() for x in settings.allowed_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

class DiscoveryRequest(BaseModel):
    skill: str = Field(min_length=2, max_length=100)
    country: str = Field(min_length=2, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    maxResults: int = Field(default=100, ge=1, le=100)

class AnalyzeRequest(BaseModel):
    skill: str = Field(min_length=2, max_length=100)
    business: dict = Field(default_factory=dict)

async def require_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to use discovery.")
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Supabase authentication is not configured on the Python API.")
    try:
        response = requests.get(settings.supabase_url.rstrip("/") + "/auth/v1/user", headers={"apikey": settings.supabase_anon_key, "Authorization": authorization}, timeout=10)
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Your session is invalid or expired. Please sign in again.")
        user = response.json()
        if not user.get("id"):
            raise HTTPException(status_code=401, detail="Could not validate the signed-in user.")
        return user
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Could not validate your session with Supabase.")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "global-lead-ai-python", "authConfigured": bool(settings.supabase_url and settings.supabase_anon_key), "aiConfigured": bool(settings.gemini_api_key), "model": settings.gemini_model if settings.gemini_api_key else None}

@app.get("/")
async def root():
    return {"name": "GlobalLead AI Python API", "docs": "/docs", "health": "/health"}

@app.post("/api/discover/businesses")
async def businesses(payload: DiscoveryRequest, user=Depends(require_user)):
    return await __import__("asyncio").to_thread(search_businesses, payload.skill, payload.country, payload.city, payload.maxResults)

@app.post("/api/discover/social")
async def social(payload: DiscoveryRequest, user=Depends(require_user)):
    return await __import__("asyncio").to_thread(search_social, payload.skill, payload.country, payload.city, payload.maxResults)

@app.post("/api/ai/analyze")
async def analyze(payload: AnalyzeRequest, user=Depends(require_user)):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Gemini is not configured. Add GEMINI_API_KEY in Render environment settings.")
    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = ("Analyze this public business candidate for the user's service. Use only supplied facts. "
                  "Return concise JSON with fitScore (0-100), detectedNeeds (array), evidenceGaps (array), "
                  "recommendedApproach, confidence, and caveats. Never invent contact details or claim intent without evidence. "
                  f"Skill: {payload.skill}\\nCandidate: {payload.business}")
        response = client.models.generate_content(model=settings.gemini_model, contents=prompt)
        return {"status": "ok", "provider": "gemini", "model": settings.gemini_model, "analysis": response.text or "No analysis returned."}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {type(exc).__name__}")
