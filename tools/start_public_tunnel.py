# tools/start_public_tunnel.py
import subprocess, time, os, re, sys

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
node_exe = os.path.join(base_dir, 'runtime', 'node.exe')
server_js = os.path.join(base_dir, 'server', 'index.js')
cf_exe = os.path.join(base_dir, 'tools', 'cloudflared.exe')
data_dir = os.path.join(base_dir, 'data')
os.makedirs(data_dir, exist_ok=True)
url_file = os.path.join(data_dir, 'public_url.txt')

# 1. Ensure server is running
port_file = os.path.join(data_dir, 'port.txt')
server_running = False
port = 4173

if os.path.exists(port_file):
    try:
        with open(port_file, 'r') as f:
            port = int(f.read().strip())
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as r:
            if r.status == 200:
                server_running = True
    except Exception:
        pass

if not server_running:
    print('Starting OpsDesk server in background...')
    subprocess.Popen([node_exe, '--no-warnings', server_js], cwd=base_dir)
    time.sleep(2)
    if os.path.exists(port_file):
        with open(port_file, 'r') as f:
            port = int(f.read().strip())

print(f'OpsDesk server is ready on http://127.0.0.1:{port}')

# 2. Start Cloudflare tunnel
print('Launching Cloudflare secure public tunnel...')
cmd = [cf_exe, 'tunnel', '--url', f'http://127.0.0.1:{port}']
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

public_url = None
start_time = time.time()

for line in proc.stdout:
    sys.stdout.write(line)
    # Look for trycloudflare.com URL
    match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
    if match:
        public_url = match.group(0)
        with open(url_file, 'w') as f:
            f.write(public_url)
        print('\n' + '='*60)
        print('  LIVE PUBLIC HTTPS URL:')
        print('  ' + public_url)
        print('='*60 + '\n')
        break
    if time.time() - start_time > 30:
        print('Timed out waiting for tunnel URL')
        break

if public_url:
    print('Tunnel is established and serving traffic!')
    # Keep running to maintain tunnel
    proc.wait()
else:
    print('Failed to establish public tunnel.')
    proc.kill()
    sys.exit(1)
