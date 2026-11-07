from typing import Literal
import requests
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .config import get_settings
from .providers import search_businesses, search_social
from .analyzer import analyze_business, score_social_opportunity

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

class SocialAnalyzeRequest(BaseModel):
    skill: str = Field(min_length=2, max_length=100)
    opportunity: dict = Field(default_factory=dict)

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
    try:
        result = await __import__("asyncio").to_thread(analyze_business, payload.skill, payload.business)
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Business analysis failed: {type(exc).__name__}. Check API key, model availability and provider limits.")

@app.post("/api/ai/score-social")
async def score_social(payload: SocialAnalyzeRequest, user=Depends(require_user)):
    try:
        result = await __import__("asyncio").to_thread(score_social_opportunity, payload.skill, payload.opportunity)
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Social opportunity analysis failed: {type(exc).__name__}. Check API key, model availability and provider limits.")
