# tools/take_screenshots.py
import subprocess, time, os, urllib.request, json

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
node_exe = os.path.join(base_dir, 'runtime', 'node.exe')
server_js = os.path.join(base_dir, 'server', 'index.js')
docs_dir = os.path.join(base_dir, 'docs', 'screenshots')
os.makedirs(docs_dir, exist_ok=True)

chrome_paths = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
]
browser_exe = next((p for p in chrome_paths if os.path.exists(p)), None)
print('Using browser:', browser_exe)

if not browser_exe:
    print('No browser found. Skipping screenshots.')
    exit(0)

# Start server
server_proc = subprocess.Popen([node_exe, '--no-warnings', server_js], cwd=base_dir)

time.sleep(1.5)

# Wait for server
port_file = os.path.join(base_dir, 'data', 'port.txt')
port = 4173
for _ in range(20):
    if os.path.exists(port_file):
        with open(port_file, 'r') as f:
            port = int(f.read().strip())
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as resp:
                if resp.status == 200:
                    print(f'Server healthy on port {port}')
                    break
        except Exception:
            pass
    time.sleep(0.3)

base_url = f'http://127.0.0.1:{port}'

# Helper to capture screenshot via Chrome headless CLI
def capture(url, out_name, width=1280, height=850):
    out_path = os.path.join(docs_dir, out_name)
    args = [
        browser_exe,
        '--headless=new',
        '--disable-gpu',
        f'--window-size={width},{height}',
        f'--screenshot={out_path}',
        url
    ]
    subprocess.run(args, check=True)
    size = os.path.getsize(out_path)
    print(f'Captured {out_name} ({size} bytes)')

try:
    capture(f'{base_url}/#login', '01_login.png')
    capture(f'{base_url}/#dashboard', '02_dashboard.png')
    capture(f'{base_url}/#queues?queue=all', '03_queues.png')
    capture(f'{base_url}/#ticket/TBO-1003', '04_ticket_detail.png')
    capture(f'{base_url}/#new-ticket', '05_new_ticket.png')
    capture(f'{base_url}/#insights', '06_insights.png')
    capture(f'{base_url}/#settings', '07_settings.png')
    # Mobile responsive check
    capture(f'{base_url}/#queues?queue=all', '08_mobile_queues.png', width=390, height=844)
    print('All screenshots captured successfully!')
finally:
    # Graceful stop
    stop_js = os.path.join(base_dir, 'tools', 'stop.js')
    subprocess.run([node_exe, stop_js], cwd=base_dir)
