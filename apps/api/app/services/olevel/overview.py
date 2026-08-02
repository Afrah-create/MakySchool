from __future__ import annotations
import uuid,asyncpg
async def overview_stats(conn:asyncpg.Connection,school_id:uuid.UUID)->dict:
 configured=await conn.fetchval("SELECT 1 FROM curricula WHERE school_id=$1 AND is_active",school_id)
 enrolled,subjects,open_sessions,pending=await conn.fetchval("SELECT COUNT(*) FROM student_curriculum_enrollments WHERE school_id=$1",school_id),await conn.fetchval("SELECT COUNT(*) FROM olevel_subjects WHERE school_id=$1 AND is_active",school_id),await conn.fetchval("SELECT COUNT(*) FROM olevel_exam_sessions WHERE school_id=$1 AND status='open'",school_id),await conn.fetchval("SELECT COUNT(*) FROM olevel_student_results WHERE school_id=$1 AND approved_at IS NULL",school_id)
 return {"configured":bool(configured),"enrolledCount":enrolled or 0,"subjects":subjects or 0,"openSessions":open_sessions or 0,"resultsPendingApproval":pending or 0}
