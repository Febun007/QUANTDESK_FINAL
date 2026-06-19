"""
auth_middleware.py — JWT authentication decorator for QuantDesk
"""
import os
import jwt
from functools import wraps
from flask import request, jsonify


def get_jwt_secret():
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set!")
    return secret


def require_auth(f):
    """
    Decorator that validates the JWT Bearer token in the Authorization header.
    Returns 401 if missing or invalid.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header missing or malformed"}), 401

        token = auth_header[len("Bearer "):]
        try:
            jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token. Please log in again."}), 401

        return f(*args, **kwargs)
    return decorated
