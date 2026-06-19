from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
import os
import bcrypt
import jwt

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
if not JWT_SECRET:
    raise RuntimeError(
        "[auth] FATAL: JWT_SECRET environment variable is not set. "
        "Add a long random string to your .env file."
    )
JWT_EXPIRY = 24  # hours

# ── In-memory user store (passwords stored as bcrypt hashes) ─────
# Default admin accounts — loaded from env so passwords aren't hardcoded.
_default_admin_pw = os.getenv("ADMIN_PASSWORD", "")
_default_user_pw  = os.getenv("USER_PASSWORD", "")

USERS: dict[str, dict] = {}

def _seed_default_users():
    """Seed default accounts from environment variables (not hardcoded)."""
    admin_email = os.getenv("ADMIN_EMAIL", "admin@quantdesk.com")
    user_email  = os.getenv("USER_EMAIL",  "karthik@quantdesk.com")

    if _default_admin_pw:
        hashed = bcrypt.hashpw(_default_admin_pw.encode(), bcrypt.gensalt())
        USERS[admin_email] = {"password_hash": hashed, "name": "Admin"}

    if _default_user_pw:
        hashed = bcrypt.hashpw(_default_user_pw.encode(), bcrypt.gensalt())
        USERS[user_email] = {"password_hash": hashed, "name": "Karthik"}

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

    user = USERS.get(email)
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

    if not name or not email or not password:
        return jsonify({"error": "Name, email and password are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if email in USERS:
        return jsonify({"error": "Email already registered"}), 409

    # Hash password with bcrypt before storing
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    USERS[email] = {"password_hash": hashed, "name": name}
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
        "users_loaded":   len(USERS),
    })


if __name__ == "__main__":
    print("=" * 52)
    print("  QuantDesk Auth Server")
    print(f"  JWT Secret  : {'[OK] Set' if JWT_SECRET else '[X] MISSING!'}")
    print(f"  Rate Limit  : {'[OK] Active' if RATE_LIMITING else '[!] Disabled'}")
    print(f"  Users loaded: {len(USERS)}")
    print("  http://127.0.0.1:5003")
    print("=" * 52)
    app.run(debug=False, port=5003, host="0.0.0.0")