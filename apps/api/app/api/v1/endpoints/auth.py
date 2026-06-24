from fastapi import APIRouter
import httpx
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter()

# Auth is handled entirely by the central auth service
# MakySchool API does NOT handle signup, login, passwords
# All auth requests should go directly to: http://localhost:8000/api/v1/auth/*

# These are just informational endpoints - clients should call auth service directly

@router.get("/info")
async def auth_info():
    """Information about authentication"""
    return {
        "message": "Authentication is handled by the central auth service",
        "auth_service_url": settings.AUTH_SERVICE_URL,
        "endpoints": {
            "signup": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/signup",
            "login": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/login",
            "verify_token": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify-token",
            "refresh_token": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/refresh-token",
            "me": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/me",
            "password_reset": f"{settings.AUTH_SERVICE_URL}/api/v1/auth/password/reset",
        }
    }
