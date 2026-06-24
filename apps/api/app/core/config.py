from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union

class Settings(BaseSettings):
    APP_NAME: str = "MakySchool API"
    PORT: int = 4000
    DATABASE_URL: str  # MakySchool PostgreSQL database
    
    # Auth Service Integration
    AUTH_SERVICE_URL: str = "http://localhost:8000"  # Your central auth API
    AUTH_JWT_SECRET: str  # Must match JWT_SECRET in auth service
    JWT_ALGORITHM: str = "HS256"
    
    CORS_ORIGINS: Union[str, List[str]] = []
    
    API_INTERNAL_URL: str = "http://localhost:4000"
    PLATFORM_APP_URL: str = "http://localhost:3001"
    
    SUBSCRIPTIONS_ENABLED: bool = False
    RUN_MIGRATIONS: bool = True
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )
        
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if isinstance(self.CORS_ORIGINS, str):
            self.CORS_ORIGINS = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings()
