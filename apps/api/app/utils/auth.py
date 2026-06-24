from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import settings
import httpx

async def verify_token_with_auth_service(token: str) -> dict:
    """Verify token with central auth service"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify-token",
                json={"access_token": token}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    return data
            return None
        except Exception:
            return None

def decode_token(token: str) -> dict:
    """Decode JWT token locally (for offline validation)"""
    try:
        return jwt.decode(token, settings.AUTH_JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
