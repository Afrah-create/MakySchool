import os
import psycopg2
from app.core.config import settings
from app.utils.auth import get_password_hash

def seed_superadmin():
    """Create or update superadmin account"""
    email = os.getenv("SUPERADMIN_EMAIL", "admin@makylegacy.com")
    password = os.getenv("SUPERADMIN_PASSWORD", "changeme123")
    force_reset = os.getenv("SUPERADMIN_FORCE_RESET", "false").lower() == "true"
    
    conn = psycopg2.connect(settings.DATABASE_URL)
    cursor = conn.cursor()
    
    # Check if superadmin exists
    cursor.execute("SELECT id FROM super_admins WHERE email = %s", (email,))
    existing = cursor.fetchone()
    
    hashed_password = get_password_hash(password)
    
    if existing:
        if force_reset:
            cursor.execute(
                "UPDATE super_admins SET password_hash = %s WHERE email = %s",
                (hashed_password, email)
            )
            conn.commit()
            print(f"✓ Superadmin password reset: {email}")
        else:
            print(f"✓ Superadmin already exists: {email}")
    else:
        cursor.execute(
            """
            INSERT INTO super_admins (email, password_hash, first_name, last_name)
            VALUES (%s, %s, 'Platform', 'Admin')
            """,
            (email, hashed_password)
        )
        conn.commit()
        print(f"✓ Superadmin created: {email}")
        print(f"  Password: {password}")
    
    cursor.close()
    conn.close()

if __name__ == "__main__":
    seed_superadmin()
