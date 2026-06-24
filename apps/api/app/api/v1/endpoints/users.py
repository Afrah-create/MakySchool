from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import Optional
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_school_id
from app.db.pool import get_db_cursor

router = APIRouter()

class LinkUserToSchoolRequest(BaseModel):
    email: str
    role: str  # admin, head_teacher, teacher, learner
    first_name: Optional[str] = None
    last_name: Optional[str] = None

@router.post("/link")
async def link_user_to_school(
    request: Request,
    body: LinkUserToSchoolRequest,
    current_user = Depends(get_current_user)
):
    """Link an authenticated user from auth service to a school role"""
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "SELECT id FROM school_users WHERE email = %s AND school_id = %s",
            (body.email, school_id)
        )
        existing = cursor.fetchone()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already linked to this school"
            )
        
        cursor.execute(
            """
            INSERT INTO school_users (email, school_id, role, first_name, last_name)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, email, role, school_id
            """,
            (body.email, school_id, body.role, body.first_name, body.last_name)
        )
        school_user = cursor.fetchone()
    
    return {"school_user": dict(school_user)}

@router.get("/my-schools")
async def get_my_schools(current_user = Depends(get_current_user)):
    """Get all schools the authenticated user belongs to"""
    user_email = current_user.get("email")
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT su.id, su.role, su.school_id, su.first_name, su.last_name,
                   s.name as school_name, s.slug as school_slug, s.status as school_status
            FROM school_users su
            JOIN schools s ON su.school_id = s.id
            WHERE su.email = %s AND su.is_active = true
            """,
            (user_email,)
        )
        schools = cursor.fetchall()
    
    return {"schools": [dict(s) for s in schools]}
