import bcrypt

BCRYPT_ROUNDS = 12


def validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one number"
    return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS),
    ).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False
