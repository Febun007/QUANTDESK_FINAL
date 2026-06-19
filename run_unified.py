import sys
import os
import re
import time
import argparse
import platform
import subprocess
import threading
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Add directories to system path
workspace_dir = Path(__file__).parent.resolve()
sys.path.append(str(workspace_dir / "backend"))
sys.path.append(str(workspace_dir / "ml-backend"))

def download_cloudflared():
    os_name = platform.system().lower()
    arch = platform.machine().lower()
    
    # Select download URL based on OS and architecture
    if os_name == "windows":
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        filename = "cloudflared.exe"
    elif os_name == "darwin":
        if "arm" in arch or "m1" in arch or "m2" in arch:
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
        else:
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64"
        filename = "cloudflared"
    else:
        if "arm" in arch or "aarch64" in arch:
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
        else:
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        filename = "cloudflared"
        
    filepath = workspace_dir / filename
    if filepath.exists():
        return str(filepath)
        
    print(f"[Tunnel] cloudflared not found. Downloading for {os_name} ({arch})...")
    print(f"[Tunnel] Source: {url}")
    try:
        # Create a custom opener with a user-agent to prevent GitHub blocking
        opener = urllib.request.build_opener()
        opener.addheaders = [('User-agent', 'Mozilla/5.0')]
        urllib.request.install_opener(opener)
        
        urllib.request.urlretrieve(url, filepath)
        if os_name != "windows":
            os.chmod(filepath, 0o755)
        print("[Tunnel] cloudflared downloaded successfully!")
        return str(filepath)
    except Exception as e:
        print(f"[Tunnel] Failed to download cloudflared: {e}")
        return None

def start_localtunnel(port):
    print("[Tunnel] Starting localtunnel as fallback...")
    time.sleep(3)
    try:
        process = subprocess.Popen(
            ["npx", "-y", "localtunnel", "--port", str(port)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=True
        )
        for line in iter(process.stdout.readline, ""):
            if "your url is" in line.lower() or "url" in line.lower():
                print("\n" + "*" * 60)
                print(f"  PUBLIC TUNNEL URL (localtunnel): {line.strip()}")
                print("  You can share this link to access the app from anywhere!")
                print("*" * 60 + "\n")
    except Exception as e:
        print(f"[Tunnel] Error running localtunnel: {e}")

def start_tunnel(port):
    cf_path = download_cloudflared()
    if not cf_path:
        print("[Tunnel] Cannot run Cloudflare Tunnel. Falling back to localtunnel...")
        start_localtunnel(port)
        return
        
    print("[Tunnel] Initializing secure Cloudflare Tunnel...")
    time.sleep(3)
    try:
        process = subprocess.Popen(
            [cf_path, "tunnel", "--url", f"http://localhost:{port}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        url_printed = False
        for line in iter(process.stdout.readline, ""):
            if ".trycloudflare.com" in line:
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
                if match:
                    url = match.group(0)
                    print("\n" + "*" * 60)
                    print(f"  PUBLIC TUNNEL URL (Cloudflare): {url}")
                    print("  This link will bypass local firewalls and work anywhere globally!")
                    print("*" * 60 + "\n")
                    url_printed = True
            # Print other cloudflared logs for troubleshooting if needed
            if not url_printed and "error" in line.lower():
                print(f"[Tunnel LOG] {line.strip()}")
    except Exception as e:
        print(f"[Tunnel] Error starting Cloudflare Tunnel: {e}")
        print("[Tunnel] Falling back to localtunnel...")
        start_localtunnel(port)

def main():
    parser = argparse.ArgumentParser(description="Run Unified QuantDesk Server")
    parser.add_argument("--port", type=int, default=5000, help="Port to listen on (default: 5000)")
    parser.add_argument("--share", action="store_true", help="Share app publicly using an encrypted firewall-bypassing tunnel")
    args = parser.parse_args()

    # Import shared app
    from shared_app import app
    
    # Import modules to register all routes on the shared app instance
    print("[Flask] Registering backend route handlers...")
    import server
    import agent_server
    import auth_server
    import ml_server
    print("[Flask] Registration complete.")

    if args.share:
        # Start tunnel in a separate thread
        tunnel_thread = threading.Thread(target=start_tunnel, args=(args.port,), daemon=True)
        tunnel_thread.start()

    print("=" * 60)
    print("  QuantDesk Unified Server Orchestrator")
    print(f"  Local URL: http://localhost:{args.port}")
    print("=" * 60)
    
    # Start Flask server
    app.run(debug=False, port=args.port, host="0.0.0.0")

if __name__ == "__main__":
    main()
