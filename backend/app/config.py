from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    supabase_url: str = ""
    supabase_anon_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    allowed_origins: str = "https://global-lead-ai.vercel.app,http://localhost:5173"
    user_agent: str = "GlobalLeadAI/1.0 (public business discovery; contact: support@global-lead-ai.vercel.app)"

@lru_cache
def get_settings() -> Settings:
    return Settings()
