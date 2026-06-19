"""
wsgi.py — QuantDesk Unified WSGI Entry Point
=============================================
Used by Gunicorn on Render:
  gunicorn --pythonpath backend:ml-backend --bind 0.0.0.0:$PORT wsgi:app

Imports the shared Flask `app` object and registers every route module
so a single process handles /api, /agent, /auth and serves the React build.
"""

import sys
import os
from pathlib import Path

# ── Add both server directories to sys.path ──────────────────────────────────
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "ml-backend"))

# ── Load environment variables from .env (ignored in production on Render) ───
from dotenv import load_dotenv
load_dotenv(ROOT / ".env")   # no-op if .env doesn't exist (Render uses env vars panel)

# ── Import shared Flask app ───────────────────────────────────────────────────
from shared_app import app   # noqa: E402

# ── Register all route modules onto the shared app ───────────────────────────
import server          # noqa: F401  →  /api/*
import agent_server    # noqa: F401  →  /agent/*
import auth_server     # noqa: F401  →  /auth/*
import ml_server       # noqa: F401  →  /api/predict/*, /api/backtest, /news/*

# ── Expose `app` for Gunicorn ─────────────────────────────────────────────────
__all__ = ["app"]
