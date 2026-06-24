from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.auth import decode_token
from app.core.config import settings

security = HTTPBearer()

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Verify user token from central auth service
    
    The token was issued by the auth service (http://localhost:8000)
    We verify it using the shared JWT secret
    """
    token = credentials.credentials
    
    # Decode JWT using shared secret
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Extract user_id from token (auth service uses 'sub' claim)
    user_id = payload.get("sub") or payload.get("user_id")
    email = payload.get("email")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token structure"
        )
    
    return {
        "user_id": user_id,
        "email": email,
        **payload  # Include all token claims
    }
