from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, schools, webhooks, users

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(schools.router, prefix="/schools", tags=["schools"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
