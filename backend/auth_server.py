from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import ipaddress
import os
import smtplib
import bcrypt
import jwt
import requests
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError

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
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@quantdesk.com").strip().lower()
LOGIN_EVENT_RETENTION_DAYS = 30
LOGIN_EVENT_RETENTION_SECONDS = LOGIN_EVENT_RETENTION_DAYS * 24 * 60 * 60
MAX_MEMORY_LOGIN_EVENTS = 1000

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USERNAME
SMTP_CONFIGURED = all((SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM))

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
_analytics_collection = None
_login_event_collection = None
REGISTRATION_ANALYTICS: dict[str, int] = {}
LOGIN_EVENTS: list[dict] = []

mongo_uri = os.getenv("MONGO_URI")
if mongo_uri:
    _mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    _mongo_client.admin.command("ping")
    _database = _mongo_client.get_database("quantdesk")
    _user_collection = _database["users"]
    _analytics_collection = _database["registration_analytics"]
    _login_event_collection = _database["login_events"]
    _user_collection.create_index("email", unique=True)
    _login_event_collection.create_index(
        "created_at", expireAfterSeconds=LOGIN_EVENT_RETENTION_SECONDS
    )

def _seed_default_users():
    """Seed only the configured admin; regular accounts are created by registration."""
    admin_hash = bcrypt.hashpw(_admin_password.encode(), bcrypt.gensalt())
    admin = {"email": ADMIN_EMAIL, "password_hash": admin_hash, "name": "Admin"}
    if _user_collection is not None:
        _user_collection.update_one(
            {"email": ADMIN_EMAIL}, {"$set": admin}, upsert=True
        )
    else:
        USERS[ADMIN_EMAIL] = admin


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


def _record_registration_analytics():
    day = datetime.utcnow().date().isoformat()
    if _analytics_collection is not None:
        try:
            _analytics_collection.update_one(
                {"_id": day}, {"$inc": {"registrations": 1}}, upsert=True
            )
        except PyMongoError as exc:
            print(f"[auth] Registration analytics write failed ({type(exc).__name__})")
        return
    REGISTRATION_ANALYTICS[day] = REGISTRATION_ANALYTICS.get(day, 0) + 1


def _lookup_ip_location(ip):
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return {}
    if not address.is_global:
        return {}

    try:
        response = requests.get(f"https://ipwho.is/{ip}", timeout=3)
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"[auth] Login location lookup failed ({type(exc).__name__})")
        return {}

    if not isinstance(result, dict) or result.get("success") is False:
        print("[auth] Login location lookup returned no result")
        return {}
    return {
        "city": result.get("city") if isinstance(result.get("city"), str) else None,
        "country": result.get("country") if isinstance(result.get("country"), str) else None,
    }


def _prune_login_events(now):
    cutoff = now - timedelta(days=LOGIN_EVENT_RETENTION_DAYS)
    retained = [event for event in LOGIN_EVENTS if event["created_at"] >= cutoff]
    LOGIN_EVENTS[:] = retained[-MAX_MEMORY_LOGIN_EVENTS:]


def _record_login_event(email):
    now = datetime.now(timezone.utc)
    try:
        ip = str(ipaddress.ip_address(request.remote_addr)) if request.remote_addr else None
    except ValueError:
        ip = None
    location = _lookup_ip_location(ip) if ip else {}
    event = {
        "email": email,
        "created_at": now,
        "ip": ip,
        "city": location.get("city"),
        "country": location.get("country"),
    }
    if _login_event_collection is not None:
        try:
            _login_event_collection.insert_one(event.copy())
        except PyMongoError as exc:
            print(f"[auth] Login event storage failed ({type(exc).__name__})")
    else:
        LOGIN_EVENTS.append(event)
        _prune_login_events(now)
    return event


def _send_login_alert(event):
    if not SMTP_CONFIGURED:
        return

    place = ", ".join(part for part in (event["city"], event["country"]) if part)
    message = EmailMessage()
    message["Subject"] = "QuantDesk successful sign-in"
    message["From"] = SMTP_FROM
    message["To"] = ADMIN_EMAIL
    message.set_content(
        "A successful sign-in occurred on QuantDesk.\n\n"
        f"Account: {event['email']}\n"
        f"Time (UTC): {event['created_at'].isoformat()}\n"
        f"IP address: {event['ip'] or 'unavailable'}\n"
        f"Approximate location: {place or 'unavailable'}\n\n"
        "Location is estimated from the IP address and may be inaccurate."
    )

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=5) as smtp:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as smtp:
                smtp.starttls()
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        print(f"[auth] Login alert email failed ({type(exc).__name__})")


_seed_default_users()
if not SMTP_CONFIGURED:
    print("[auth] WARNING: SMTP is not configured; login email alerts are disabled.")

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

    event = _record_login_event(email)
    _send_login_alert(event)
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
    if body.get("analytics_consent") is True:
        _record_registration_analytics()
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


@app.route("/auth/admin/login-alerts", methods=["GET"])
def admin_login_alerts():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Authorization required"}), 401
    try:
        payload = jwt.decode(
            auth_header[len("Bearer "):], JWT_SECRET, algorithms=["HS256"]
        )
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid or expired token"}), 401
    if str(payload.get("email", "")).lower() != ADMIN_EMAIL:
        return jsonify({"error": "Administrator access required"}), 403

    if _login_event_collection is not None:
        try:
            events = list(
                _login_event_collection.find(
                    {}, {"_id": 0}
                ).sort("created_at", -1).limit(100)
            )
        except PyMongoError as exc:
            print(f"[auth] Login event query failed ({type(exc).__name__})")
            return jsonify({"error": "Login alerts are temporarily unavailable"}), 503
    else:
        now = datetime.now(timezone.utc)
        _prune_login_events(now)
        events = sorted(
            LOGIN_EVENTS, key=lambda event: event["created_at"], reverse=True
        )[:100]

    return jsonify({
        "events": [
            {
                **event,
                "created_at": event["created_at"].isoformat(),
            }
            for event in events
        ],
        "email_alerts_enabled": SMTP_CONFIGURED,
        "retention_days": LOGIN_EVENT_RETENTION_DAYS,
        "persistent_history": _login_event_collection is not None,
    })


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