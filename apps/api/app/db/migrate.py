import os
import psycopg2
from pathlib import Path
from app.core.config import settings

def run_migrations():
    """Run all pending SQL migrations"""
    migrations_dir = Path(__file__).parent.parent / "migrations"
    
    conn = psycopg2.connect(settings.DATABASE_URL)
    cursor = conn.cursor()
    
    # Create migrations tracking table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Get applied migrations
    cursor.execute("SELECT version FROM schema_migrations")
    applied = {row[0] for row in cursor.fetchall()}
    
    # Get migration files
    migration_files = sorted([
        f for f in os.listdir(migrations_dir) 
        if f.endswith('.sql') and f != 'schema.sql'
    ])
    
    # Run pending migrations
    for migration_file in migration_files:
        if migration_file in applied:
            print(f"✓ Already applied: {migration_file}")
            continue
        
        print(f"→ Applying: {migration_file}")
        
        migration_path = migrations_dir / migration_file
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        try:
            cursor.execute(sql)
            cursor.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)",
                (migration_file,)
            )
            conn.commit()
            print(f"✓ Applied: {migration_file}")
        except Exception as e:
            conn.rollback()
            print(f"✗ Failed: {migration_file}")
            print(f"  Error: {e}")
            break
    
    cursor.close()
    conn.close()
    print("\n✓ Migration complete")

if __name__ == "__main__":
    run_migrations()
