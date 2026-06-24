from fastapi import Request, HTTPException, status
from typing import Optional
from app.db.pool import get_db_cursor

tenant_cache = {}

async def get_tenant_from_header(request: Request) -> Optional[dict]:
    school_slug = request.headers.get("x-school-slug")
    school_id = request.headers.get("x-school-id")
    
    if not school_slug:
        return None
    
    if school_slug in tenant_cache:
        return tenant_cache[school_slug]
    
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT id, slug, name, status FROM schools WHERE slug = %s",
            (school_slug,)
        )
        school = cursor.fetchone()
        
        if school:
            tenant_cache[school_slug] = dict(school)
            return tenant_cache[school_slug]
    
    return None

def require_tenant(request: Request):
    school_slug = request.headers.get("x-school-slug")
    if not school_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing tenant context"
        )
    return school_slug

def get_school_id(request: Request) -> int:
    school_id = request.headers.get("x-school-id")
    if not school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing school ID in request"
        )
    try:
        return int(school_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid school ID"
        )
