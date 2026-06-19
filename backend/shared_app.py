from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_caching import Cache

import os

# ── Resolve the React build directory ──────────────────────────────────────
# Works both locally (frontend/build) and on Render (same relative path after
# the build step in render.yaml runs `cd frontend && npm run build`).
frontend_build = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../frontend/build")
)

app = Flask(__name__, static_folder=frontend_build, static_url_path="/")

# ── CORS — allow the current origin and any ALLOWED_ORIGINS env var ────────
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# On Render, the service URL is also an allowed origin automatically
_render_url = os.getenv("RENDER_EXTERNAL_URL", "")
if _render_url and _render_url not in _allowed_origins:
    _allowed_origins.append(_render_url)

CORS(app, origins=_allowed_origins, supports_credentials=True)

cache = Cache(app, config={
    "CACHE_TYPE":            "SimpleCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
})

if not os.path.exists(frontend_build):
    print(
        "[Flask] WARNING: frontend/build not found. "
        "Run `cd frontend && npm run build` first."
    )


# ── Catch-all: serve React app (supports client-side routing) ──────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    # Serve real static files (JS, CSS, images …)
    target = os.path.join(app.static_folder, path)
    if path and os.path.exists(target):
        return send_from_directory(app.static_folder, path)
    # Fall back to index.html for every React route
    return send_from_directory(app.static_folder, "index.html")
