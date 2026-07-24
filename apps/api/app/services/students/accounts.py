"""Provision and reset learner portal login accounts linked to students."""

from __future__ import annotations

import secrets
import uuid

import asyncpg

from app.lib.password import hash_password

LEARNER_EMAIL_DOMAIN = "learner.makyschool.local"


def learner_portal_email(*, school_slug: str, learner_id: str) -> str:
    """Synthetic email satisfying users.email uniqueness; not used for login UI."""
    local = "".join(ch if ch.isalnum() else "-" for ch in learner_id.strip().lower())
    slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in school_slug.strip().lower())
    return f"{local}@{slug}.{LEARNER_EMAIL_DOMAIN}"


def is_learner_portal_email(email: str | None) -> bool:
    if not email:
        return False
    return email.lower().endswith(f".{LEARNER_EMAIL_DOMAIN}")


async def fetch_school_slug(conn: asyncpg.Connection, school_id: uuid.UUID) -> str:
    slug = await conn.fetchval("SELECT slug FROM schools WHERE id = $1 LIMIT 1", school_id)
    if not slug:
        raise ValueError("School not found")
    return str(slug)


async def provision_learner_account(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    school_slug: str,
    student_id: uuid.UUID,
    learner_id: str,
    full_name: str,
    created_by: uuid.UUID | None,
) -> str:
    """
    Create a users row (role=learner) linked to the student and return the temp password.
    Caller must run inside an open transaction when creating the student in the same txn.
    """
    existing_user_id = await conn.fetchval(
        "SELECT user_id FROM students WHERE id = $1 AND school_id = $2",
        student_id,
        school_id,
    )
    if existing_user_id:
        return await reset_learner_password(
            conn,
            school_id=school_id,
            student_id=student_id,
        )

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)
    user_id = uuid.uuid4()
    email = learner_portal_email(school_slug=school_slug, learner_id=learner_id)

    await conn.execute(
        """
        INSERT INTO users (
          id, school_id, email, password_hash, full_name, name, role,
          is_temp_password, is_active, account_status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $5, 'learner', true, true, 'ACTIVE', $6)
        """,
        user_id,
        school_id,
        email,
        password_hash,
        full_name.strip(),
        created_by,
    )

    await conn.execute(
        """
        UPDATE students
        SET user_id = $1, updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        """,
        user_id,
        student_id,
        school_id,
    )

    return temp_password


async def reset_learner_password(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> str:
    """Reset (or create) portal credentials for a student. Returns new temp password."""
    row = await conn.fetchrow(
        """
        SELECT s.id, s.learner_id, s.full_name, s.user_id, sc.slug AS school_slug
        FROM students s
        JOIN schools sc ON sc.id = s.school_id
        WHERE s.id = $1 AND s.school_id = $2
        LIMIT 1
        """,
        student_id,
        school_id,
    )
    if not row:
        raise LookupError("Student not found")

    if not row["user_id"]:
        return await provision_learner_account(
            conn,
            school_id=school_id,
            school_slug=row["school_slug"],
            student_id=student_id,
            learner_id=row["learner_id"],
            full_name=row["full_name"],
            created_by=None,
        )

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)

    await conn.execute(
        """
        UPDATE users
        SET password_hash = $1,
            is_temp_password = true,
            full_name = COALESCE($2, full_name),
            name = COALESCE($2, name),
            updated_at = NOW()
        WHERE id = $3 AND school_id = $4
        """,
        password_hash,
        row["full_name"],
        row["user_id"],
        school_id,
    )

    return temp_password


async def resolve_student_for_user(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT
          s.id,
          s.learner_id,
          s.full_name,
          s.date_of_birth,
          s.gender,
          s.photo_url,
          s.status,
          s.current_class_id,
          s.user_id,
          sc.level,
          sc.stream
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.school_id = $1 AND s.user_id = $2
        LIMIT 1
        """,
        school_id,
        user_id,
    )
