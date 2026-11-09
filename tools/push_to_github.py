"""
OpsDesk GitHub Pusher & Release Publisher (Zero-Git, Pure Python)
Uses GitHub REST API to:
 1. Recursively upload all project source files (preserving folder structure)
 2. Handles spaces in file names (e.g. '1 START OpsDesk.bat')
 3. Creates/Updates a GitHub Release 'v1.0.0' and attaches OpsDesk_v1.zip
Works without Git or GitHub CLI installed.
"""

import os
import sys
import time
import json
import base64
import hashlib
import urllib.parse
import urllib.request
import urllib.error

GITHUB_USER = "Anshsingh842"
REPO_NAME = "OpsDesk"
REPO_DESC = "OpsDesk — Travel Operations Ticketing Platform for TBO Hackathon (MVP)"

def git_blob_sha(content_bytes):
    """Computes standard Git blob SHA1: sha1('blob ' + size + '\0' + content)"""
    header = f"blob {len(content_bytes)}\0".encode("utf-8")
    return hashlib.sha1(header + content_bytes).hexdigest()

def make_request(url, method="GET", token=None, data=None, content_type="application/json", raw_data=None):
    headers = {
        "User-Agent": "OpsDesk-Pusher",
        "Accept": "application/vnd.github.v3+json"
    }
    if token:
        headers["Authorization"] = f"token {token}"
    
    body = None
    if raw_data is not None:
        headers["Content-Type"] = content_type
        body = raw_data
    elif data is not None:
        headers["Content-Type"] = content_type
        body = json.dumps(data).encode("utf-8")
        
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = resp.status
            resp_body = resp.read()
            try:
                return status, json.loads(resp_body.decode("utf-8")) if resp_body else {}
            except Exception:
                return status, resp_body
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(err_msg)
        except Exception:
            return e.code, {"message": err_msg}
    except Exception as e:
        return 500, {"message": f"Network/Request Error: {str(e)}"}

def upload_file_to_repo(base_dir, rel_path, login, token):
    full_path = os.path.join(base_dir, rel_path)
    github_path = rel_path.replace("\\", "/")
    
    # URL-encode path while keeping forward slashes (fixes '1 START OpsDesk.bat' spaces)
    quoted_path = urllib.parse.quote(github_path, safe="/")
    
    with open(full_path, "rb") as f:
        file_bytes = f.read()
    
    content_b64 = base64.b64encode(file_bytes).decode("utf-8")
    local_sha = git_blob_sha(file_bytes)
        
    # Check if exists to compare SHA
    get_code, file_info = make_request(
        f"https://api.github.com/repos/{login}/{REPO_NAME}/contents/{quoted_path}",
        token=token
    )
    
    if get_code == 200 and isinstance(file_info, dict):
        remote_sha = file_info.get("sha")
        if remote_sha == local_sha:
            print(f"  [OK - UP TO DATE] {github_path}")
            return True
            
        put_data = {
            "message": f"Update {github_path}",
            "content": content_b64,
            "sha": remote_sha
        }
    else:
        put_data = {
            "message": f"Add {github_path}",
            "content": content_b64
        }
        
    put_code, put_resp = make_request(
        f"https://api.github.com/repos/{login}/{REPO_NAME}/contents/{quoted_path}",
        method="PUT",
        token=token,
        data=put_data
    )
    
    if put_code in [200, 201]:
        print(f"  [OK - UPLOADED] {github_path}")
        return True
    else:
        msg = put_resp.get("message") if isinstance(put_resp, dict) else str(put_resp)
        print(f"  [FAIL] {github_path}: {msg}")
        return False

def main():
    print("=" * 65)
    print(" OpsDesk Full GitHub Publisher (Files, Folders & ZIP Release)")
    print(f" Target: https://github.com/{GITHUB_USER}/{REPO_NAME}")
    print("=" * 65)
    print()
    print("Kyunki browser mein folder ke andar folder upload karna muskhil hai,")
    print("yeh tool tumhare saare folders (server, web, tests, docs) aur poora")
    print("OpsDesk_v1.zip direct GitHub API se upload kar dega.")
    print()
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    token_file = os.path.join(base_dir, "data", "github_token.txt")
    
    token = None
    if os.path.exists(token_file):
        try:
            with open(token_file, "r") as tf:
                saved = tf.read().strip()
                if saved:
                    use_saved = input(f"Saved token mila ({saved[:4]}...{saved[-4:]}). Use this? (Y/n): ").strip().lower()
                    if use_saved not in ["n", "no"]:
                        token = saved
        except Exception:
            pass

    if not token and len(sys.argv) > 1:
        token = sys.argv[1].strip()

    if not token:
        print("GitHub Personal Access Token paste karo:")
        print("  Agar nahi hai: https://github.com/settings/tokens/new")
        print("  (Note: 'OpsDesk', 'repo' tick karo, 'Generate token' dabao)")
        print()
        try:
            token = input("Token: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            return

    if not token:
        print("\nKoi token provide nahi kiya.")
        input("\nPress Enter to exit...")
        return

    # Save token for convenience
    try:
        os.makedirs(os.path.join(base_dir, "data"), exist_ok=True)
        with open(token_file, "w") as tf:
            tf.write(token)
    except Exception:
        pass

    print("\n[Step 1/3] GitHub Authentication verify ho raha hai...")
    code, user_info = make_request("https://api.github.com/user", token=token)
    if code != 200:
        err_detail = user_info.get("message") if isinstance(user_info, dict) else str(user_info)
        print(f"ERROR: Token invalid hai (HTTP {code}): {err_detail}")
        if os.path.exists(token_file):
            os.remove(token_file)
        input("\nPress Enter to exit...")
        return

    login = user_info.get("login")
    print(f"Verified! Logged in as: @{login}")

    print(f"\n[Step 2/3] Repository '{REPO_NAME}' check kar rahe hain...")
    chk, _ = make_request(f"https://api.github.com/repos/{login}/{REPO_NAME}", token=token)
    if chk != 200:
        print(f"Creating new repository https://github.com/{login}/{REPO_NAME}...")
        create_code, _ = make_request("https://api.github.com/user/repos", method="POST", token=token, data={
            "name": REPO_NAME,
            "description": REPO_DESC,
            "private": False
        })
        if create_code not in [200, 201]:
            print("Failed to create repository.")
            input("\nPress Enter to exit...")
            return
    print(f"Repository ready: https://github.com/{login}/{REPO_NAME}")

    print("\n[Step 3/3] Uploading all project files & nested folders...")
    
    # Exclude binaries and cache from git commit tree (binaries go to GitHub Release)
    exclude_dirs = {"runtime", "node_modules", ".git", "__pycache__", "chrome_cdp_profile"}
    exclude_files = {
        "cloudflared.exe", "node.exe", "opsdesk.sqlite3", 
        "opsdesk.sqlite3-shm", "opsdesk.sqlite3-wal",
        "OpsDesk_v1.zip", "github_token.txt", "port.txt", "public_url.txt"
    }

    uploaded_count = 0
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in files:
            if f in exclude_files or f.endswith(".sqlite3") or f.endswith(".pyc"):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, base_dir)
            if upload_file_to_repo(base_dir, rel_path, login, token):
                uploaded_count += 1
            time.sleep(0.05) # Prevent secondary rate limit

    print(f"\nDone! {uploaded_count} files verified/uploaded with folder hierarchy.")

    # Upload Release ZIP
    zip_path = os.path.join(os.path.dirname(base_dir), "OpsDesk_v1.zip")
    if not os.path.exists(zip_path):
        zip_path = os.path.join(r"C:\Users\ansh singh\Downloads", "OpsDesk_v1.zip")

    if os.path.exists(zip_path):
        size_mb = os.path.getsize(zip_path) / (1024 * 1024)
        print(f"\n[Bonus] Uploading OpsDesk_v1.zip ({size_mb:.1f} MB) to GitHub Releases...")
        print("Please wait ~1-2 minutes while the ZIP uploads (do not close this window)...")
        
        rel_code, rel_data = make_request(
            f"https://api.github.com/repos/{login}/{REPO_NAME}/releases/tags/v1.0.0",
            token=token
        )
        if rel_code != 200:
            rel_code, rel_data = make_request(
                f"https://api.github.com/repos/{login}/{REPO_NAME}/releases",
                method="POST",
                token=token,
                data={
                    "tag_name": "v1.0.0",
                    "name": "OpsDesk v1.0.0 (Windows 1-Click Portable Hackathon Build)",
                    "body": "Download OpsDesk_v1.zip below, extract, and double-click '1 START OpsDesk.bat' to run instantly on Windows without installing anything!",
                    "draft": False,
                    "prerelease": False
                }
            )
        
        if rel_code in [200, 201] and isinstance(rel_data, dict) and "id" in rel_data:
            release_id = rel_data["id"]
            
            # Check existing assets
            assets_code, assets = make_request(
                f"https://api.github.com/repos/{login}/{REPO_NAME}/releases/{release_id}/assets",
                token=token
            )
            if assets_code == 200 and isinstance(assets, list):
                for asset in assets:
                    if asset.get("name") == "OpsDesk_v1.zip":
                        print("Existing OpsDesk_v1.zip found in release, updating...")
                        make_request(asset["url"], method="DELETE", token=token)
                        time.sleep(1)
            
            upload_url = f"https://uploads.github.com/repos/{login}/{REPO_NAME}/releases/{release_id}/assets?name=OpsDesk_v1.zip"
            with open(zip_path, "rb") as zf:
                raw_bytes = zf.read()
            up_code, up_res = make_request(
                upload_url,
                method="POST",
                token=token,
                raw_data=raw_bytes,
                content_type="application/zip"
            )
            if up_code in [200, 201]:
                print("SUCCESS: OpsDesk_v1.zip successfully attached to GitHub Release!")
            else:
                print(f"Notice: Release asset response HTTP {up_code}")

    print("\n" + "=" * 65)
    print(" BADHAI HO! Sabhi folders, code aur ZIP release live ho gaye!")
    print(f" Code Repository: https://github.com/{login}/{REPO_NAME}")
    print(f" Windows ZIP:     https://github.com/{login}/{REPO_NAME}/releases")
    print("=" * 65)
    input("\nPress Enter to finish...")

if __name__ == "__main__":
    main()
