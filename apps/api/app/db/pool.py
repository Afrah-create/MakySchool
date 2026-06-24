import psycopg2
from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import RealDictCursor
from app.core.config import settings
from contextlib import contextmanager

pool = None

async def init_db():
    global pool
    pool = SimpleConnectionPool(
        minconn=1,
        maxconn=20,
        dsn=settings.DATABASE_URL
    )

async def close_db():
    global pool
    if pool:
        pool.closeall()

@contextmanager
def get_db_connection():
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

@contextmanager
def get_db_cursor(commit=False):
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
