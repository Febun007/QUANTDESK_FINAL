from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
import os
import bcrypt
import jwt
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from shared_app import app

# ── Rate limiting ─────────────────────────────────────────────────
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(app=app, key_func=get_remote_address, default_limits=["500/day"])
    RATE_LIMITING = True
except ImportError:
    print("[auth] WARNING: flask-limiter not installed. Rate limiting disabled. Run: pip install flask-limiter")
    limiter = None
    RATE_LIMITING = False

# ── JWT configuration from environment ───────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "[auth] FATAL: JWT_SECRET must be set to a random value of at least 32 characters."
    )
JWT_EXPIRY = 24  # hours

# ── In-memory user store (passwords stored as bcrypt hashes) ─────
def _required_password(name: str) -> str:
    password = os.getenv(name)
    if not password or len(password) < 12:
        raise RuntimeError(f"[auth] FATAL: {name} must be set to at least 12 characters.")
    if len(password.encode("utf-8")) > 72:
        raise RuntimeError(f"[auth] FATAL: {name} must not exceed bcrypt's 72-byte limit.")
    return password


_admin_password = _required_password("ADMIN_PASSWORD")

USERS: dict[str, dict] = {}
_user_collection = None

mongo_uri = os.getenv("MONGO_URI")
if mongo_uri:
    _mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    _mongo_client.admin.command("ping")
    _user_collection = _mongo_client.get_database("quantdesk")["users"]
    _user_collection.create_index("email", unique=True)

def _seed_default_users():
    """Seed only the configured admin; regular accounts are created by registration."""
    admin_email = os.getenv("ADMIN_EMAIL", "admin@quantdesk.com").strip().lower()
    admin_hash = bcrypt.hashpw(_admin_password.encode(), bcrypt.gensalt())
    admin = {"email": admin_email, "password_hash": admin_hash, "name": "Admin"}
    if _user_collection is not None:
        _user_collection.update_one(
            {"email": admin_email}, {"$set": admin}, upsert=True
        )
    else:
        USERS[admin_email] = admin


def _find_user(email: str):
    if _user_collection is not None:
        return _user_collection.find_one({"email": email})
    return USERS.get(email)


def _create_user(user: dict) -> bool:
    if _user_collection is not None:
        try:
            _user_collection.insert_one(user)
            return True
        except DuplicateKeyError:
            return False
    if user["email"] in USERS:
        return False
    USERS[user["email"]] = user
    return True

_seed_default_users()

# ── Helpers ───────────────────────────────────────────────────────
def generate_token(email: str, name: str) -> str:
    payload = {
        "email": email,
        "name":  name,
        "exp":   datetime.utcnow() + timedelta(hours=JWT_EXPIRY),
        "iat":   datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ── ROUTE: Login ──────────────────────────────────────────────────
def _login_route():
    body     = request.json or {}
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = _find_user(email)
    # Use bcrypt.checkpw for constant-time comparison — prevents timing attacks
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"]):
        return jsonify({"error": "Invalid email or password"}), 401

    token = generate_token(email, user["name"])
    print(f"[auth] Login: {email}")

    return jsonify({
        "message": "Login successful",
        "token":   token,
        "user":    {"name": user["name"], "email": email},
    })

if RATE_LIMITING:
    @app.route("/auth/login", methods=["POST"])
    @limiter.limit("10/minute; 50/hour")
    def login():
        return _login_route()
else:
    @app.route("/auth/login", methods=["POST"])
    def login():
        return _login_route()


# ── ROUTE: Register ───────────────────────────────────────────────
def _register_route():
    body     = request.json or {}
    name     = body.get("name", "").strip()
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not name or not email or not isinstance(password, str) or not password:
        return jsonify({"error": "Name, email and password are required"}), 400
    if len(password) < 12 or len(password.encode("utf-8")) > 72:
        return jsonify({"error": "Password must be 12-72 UTF-8 bytes"}), 400
    # Hash password with bcrypt before storing
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    if not _create_user({"email": email, "password_hash": hashed, "name": name}):
        return jsonify({"error": "Email already registered"}), 409
    token = generate_token(email, name)
    print(f"[auth] Registered: {email}")

    return jsonify({
        "message": "Account created successfully",
        "token":   token,
        "user":    {"name": name, "email": email},
    }), 201

if RATE_LIMITING:
    @app.route("/auth/register", methods=["POST"])
    @limiter.limit("5/hour")
    def register():
        return _register_route()
else:
    @app.route("/auth/register", methods=["POST"])
    def register():
        return _register_route()


# ── ROUTE: Verify token ───────────────────────────────────────────
@app.route("/auth/verify", methods=["POST"])
def verify():
    token = (request.json or {}).get("token")
    if not token:
        return jsonify({"valid": False}), 400
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return jsonify({"valid": True, "user": {"email": payload["email"], "name": payload["name"]}})
    except jwt.ExpiredSignatureError:
        return jsonify({"valid": False, "reason": "expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"valid": False, "reason": "invalid"}), 401


# ── ROUTE: Health ─────────────────────────────────────────────────
@app.route("/auth/health")
def auth_health():
    return jsonify({
        "status":         "ok",
        "mode":           "bcrypt + JWT",
        "rate_limiting":  RATE_LIMITING,
        "persistent_users": _user_collection is not None,
        "users_loaded": (
            _user_collection.count_documents({})
            if _user_collection is not None else len(USERS)
        ),
    })


if __name__ == "__main__":
    print("=" * 52)
    print("  QuantDesk Auth Server")
    print(f"  JWT Secret  : {'[OK] Set' if JWT_SECRET else '[X] MISSING!'}")
    print(f"  Rate Limit  : {'[OK] Active' if RATE_LIMITING else '[!] Disabled'}")
    print(f"  Persistent users: {_user_collection is not None}")
    print("  http://127.0.0.1:5003")
    print("=" * 52)
    app.run(debug=False, port=5003, host="0.0.0.0")