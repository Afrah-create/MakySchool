from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import List, Optional
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_school_id
from app.db.pool import get_db_cursor

router = APIRouter()

class SetupProfileRequest(BaseModel):
    motto: Optional[str] = None
    vision: Optional[str] = None
    mission: Optional[str] = None

class AcademicYearRequest(BaseModel):
    name: str
    startDate: str
    endDate: str

class GradingScaleRequest(BaseModel):
    name: str
    grades: List[dict]

# Setup endpoints
@router.get("/setup/status")
async def get_setup_status(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT setup_completed_at, profile_completed, academic_year_id, grading_scale_id
            FROM schools
            WHERE id = %s
            """,
            (school_id,)
        )
        school = cursor.fetchone()
    
    if not school:
        return {"setupCompleted": False}
    
    return {
        "setupCompleted": school["setup_completed_at"] is not None,
        "profileCompleted": school["profile_completed"],
        "academicYearConfigured": school["academic_year_id"] is not None,
        "gradingScaleConfigured": school["grading_scale_id"] is not None
    }

@router.patch("/setup/profile")
async def save_setup_profile(
    request: Request,
    body: SetupProfileRequest,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE schools 
            SET motto = %s, vision = %s, mission = %s, profile_completed = true
            WHERE id = %s
            """,
            (body.motto, body.vision, body.mission, school_id)
        )
    
    return {"message": "Profile saved"}

@router.post("/setup/complete")
async def complete_setup(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE schools SET setup_completed_at = NOW() WHERE id = %s",
            (school_id,)
        )
    
    return {"message": "Setup completed"}

# Classes endpoints
@router.get("/classes")
async def list_classes(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT c.id, c.level, c.stream, c.capacity, c.created_at,
                   COUNT(DISTINCT cs.subject_id) as subject_count
            FROM classes c
            LEFT JOIN class_subjects cs ON c.id = cs.class_id
            WHERE c.school_id = %s
            GROUP BY c.id
            ORDER BY c.level, c.stream
            """,
            (school_id,)
        )
        classes = cursor.fetchall()
    
    return {"classes": [dict(c) for c in classes]}

class CreateClassRequest(BaseModel):
    level: str
    stream: Optional[str] = None
    capacity: Optional[int] = None

@router.post("/classes")
async def create_class(
    request: Request,
    body: CreateClassRequest,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO classes (school_id, level, stream, capacity)
            VALUES (%s, %s, %s, %s)
            RETURNING id, level, stream, capacity
            """,
            (school_id, body.level, body.stream, body.capacity)
        )
        new_class = cursor.fetchone()
    
    return {"class": dict(new_class)}

@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: int,
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            "DELETE FROM classes WHERE id = %s AND school_id = %s",
            (class_id, school_id)
        )
    
    return {"message": "Class deleted"}

# Subjects endpoints
@router.get("/subjects")
async def list_subjects(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT id, name, code, is_core, created_at
            FROM subjects
            WHERE school_id = %s
            ORDER BY name
            """,
            (school_id,)
        )
        subjects = cursor.fetchall()
    
    return {"subjects": [dict(s) for s in subjects]}

class CreateSubjectRequest(BaseModel):
    name: str
    code: str
    isCore: bool = False

@router.post("/subjects")
async def create_subject(
    request: Request,
    body: CreateSubjectRequest,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO subjects (school_id, name, code, is_core)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, code, is_core
            """,
            (school_id, body.name, body.code, body.isCore)
        )
        subject = cursor.fetchone()
    
    return {"subject": dict(subject)}

# Teachers endpoints
@router.get("/teachers")
async def list_teachers(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.created_at
            FROM users u
            WHERE u.school_id = %s AND u.role = 'teacher' AND u.is_active = true
            ORDER BY u.first_name, u.last_name
            """,
            (school_id,)
        )
        teachers = cursor.fetchall()
    
    return {"teachers": [dict(t) for t in teachers]}

# Students endpoints
@router.get("/students")
async def list_students(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT s.id, s.learner_id, s.first_name, s.last_name, s.date_of_birth,
                   s.gender, s.class_id, c.level, c.stream
            FROM students s
            LEFT JOIN classes c ON s.class_id = c.id
            WHERE s.school_id = %s
            ORDER BY s.first_name, s.last_name
            """,
            (school_id,)
        )
        students = cursor.fetchall()
    
    return {"students": [dict(s) for s in students]}

# Users endpoints
@router.get("/users")
async def list_users(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT id, email, first_name, last_name, role, is_active, created_at
            FROM users
            WHERE school_id = %s
            ORDER BY created_at DESC
            """,
            (school_id,)
        )
        users = cursor.fetchall()
    
    return {"users": [dict(u) for u in users]}

# Billing endpoints
@router.get("/billing")
async def get_billing_info(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT s.id, s.subscription_status, s.subscription_end_date
            FROM schools s
            WHERE s.id = %s
            """,
            (school_id,)
        )
        school = cursor.fetchone()
    
    return {"billing": dict(school) if school else {}}

# Fees endpoints
@router.get("/fees")
async def list_fees(
    request: Request,
    user = Depends(get_current_user)
):
    school_id = get_school_id(request)
    
    return {"fees": []}
