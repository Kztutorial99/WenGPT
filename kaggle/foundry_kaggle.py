# Foundry AI server for Kaggle - satu script untuk semua akun.
# Jalankan dengan "Save Version -> Save & Run All" (atau otomatis via GitHub Actions).
# Tiap akun lapor URL tunnel-nya sendiri ke Upstash: foundry:ai-url:<ACCOUNT_ID>

# %% [code]
# CELL 0 - PENGATURAN (GitHub Actions mengisi otomatis; kalau manual, isi sendiri)
ACCOUNT_ID = "__ACCOUNT_ID__"        # "1", "2", atau "3" - beda di tiap akun
UPSTASH_URL = "__UPSTASH_URL__"
UPSTASH_TOKEN = "__UPSTASH_TOKEN__"
DATASET = "kztutorial/rvn-cache"     # dataset cache (harus Public / di-share ke akun lain)

# Boleh juga simpan di Kaggle Add-ons -> Secrets (nama sama) supaya tidak ditulis di sini
try:
    from kaggle_secrets import UserSecretsClient
    _s = UserSecretsClient()
    for _n in ["ACCOUNT_ID", "UPSTASH_URL", "UPSTASH_TOKEN"]:
        if globals()[_n].startswith("__"):
            try: globals()[_n] = _s.get_secret(_n)
            except Exception: pass
except Exception:
    pass

# %% [code]
# CELL 1 - AMBIL CACHE: dari Input kalau sudah ditempel, kalau tidak download via kagglehub
import os, glob, subprocess
CACHE = None
for d in glob.glob('/kaggle/input/*') + glob.glob('/kaggle/input/*/*') + glob.glob('/kaggle/input/*/*/*'):
    if os.path.isdir(os.path.join(d, 'ollama_models')):
        CACHE = d; break
if not CACHE:
    subprocess.run("pip install -q -U kagglehub", shell=True)
    import kagglehub
    print(f"Download dataset {DATASET} (sekali per sesi)...")
    p = kagglehub.dataset_download(DATASET)
    for d in [p] + glob.glob(f"{p}/*") + glob.glob(f"{p}/*/*"):
        if os.path.isdir(os.path.join(d, 'ollama_models')):
            CACHE = d; break
print("CACHE:", CACHE or "TIDAK ADA -> semua di-download dari internet")

# %% [code]
# CELL 2 - INSTALL OLLAMA + CLOUDFLARED
import shutil
def run(cmd):
    print(f"$ {cmd}", flush=True)
    r = subprocess.run(cmd, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print((r.stdout or "")[-2000:]); return r

if CACHE and os.path.exists(f"{CACHE}/bin/ollama.tgz"):
    run(f"sudo tar -xzf {CACHE}/bin/ollama.tgz -C /")
    run(f"sudo cp {CACHE}/bin/cloudflared /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared /usr/local/bin/ollama")
if not shutil.which("ollama"):
    run("sudo apt-get update -qq && sudo apt-get install -y zstd")
    if run("curl -fsSL https://ollama.com/install.sh | sh").returncode != 0: raise RuntimeError("Gagal install Ollama")
if not shutil.which("cloudflared"):
    if run("curl -L --fail https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared").returncode != 0:
        raise RuntimeError("Gagal install cloudflared")
if not CACHE:
    os.makedirs("/kaggle/working/bin", exist_ok=True)
    run("tar -czf /kaggle/working/bin/ollama.tgz /usr/local/bin/ollama /usr/local/lib/ollama 2>/dev/null; cp /usr/local/bin/cloudflared /kaggle/working/bin/")

# %% [code]
# CELL 3 - JALANKAN OLLAMA (auto-hidup-lagi kalau crash)
import time, threading, requests
MODEL = "hf.co/slevinw/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF:RVN-Q4_K_M-multilingual.gguf"
HF_REPO = "slevinw/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF"
HF_FILE = "RVN-Q4_K_M-multilingual.gguf"
OLLAMA_URL = "http://127.0.0.1:11434"
LOG_FILE = "/kaggle/working/ollama.log"

MODEL_DIR = f"{CACHE}/ollama_models" if CACHE else "/kaggle/working/ollama_models"
os.makedirs(MODEL_DIR, exist_ok=True)
os.environ.update(OLLAMA_MODELS=MODEL_DIR, OLLAMA_NOPRUNE="1", OLLAMA_HOST="0.0.0.0:11434", OLLAMA_ORIGINS="*",
                  OLLAMA_KEEP_ALIVE="-1", OLLAMA_FLASH_ATTENTION="1", OLLAMA_KV_CACHE_TYPE="q8_0",
                  OLLAMA_NUM_PARALLEL="1", OLLAMA_SCHED_SPREAD="1")

def ollama_ok():
    try: return requests.get(f"{OLLAMA_URL}/api/tags", timeout=5).status_code == 200
    except Exception: return False

def start_ollama():
    log = open(LOG_FILE, "a")
    subprocess.Popen(["ollama", "serve"], env=os.environ.copy(), stdout=log, stderr=log)
    for _ in range(90):
        if ollama_ok(): return True
        time.sleep(1)
    return False

if not ollama_ok() and not start_ollama():
    print(open(LOG_FILE).read()[-4000:]); raise RuntimeError("Ollama gagal jalan")
print("OK Ollama jalan")

# %% [code]
# CELL 4 - MODEL
ACTIVE_MODEL = MODEL
def ollama_has(n):
    return subprocess.run(["ollama", "show", n], capture_output=True, env=os.environ.copy()).returncode == 0
if not ollama_has(MODEL):
    if subprocess.run(["ollama", "pull", MODEL], env=os.environ.copy()).returncode != 0:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(repo_id=HF_REPO, filename=HF_FILE)
        open("/kaggle/working/Modelfile", "w").write(f"FROM {path}\nPARAMETER num_ctx 8192\n")
        if subprocess.run(["ollama", "create", "rvn27b", "-f", "/kaggle/working/Modelfile"], env=os.environ.copy()).returncode != 0:
            raise RuntimeError("Gagal membuat model rvn27b")
        ACTIVE_MODEL = "rvn27b"
print("Model:", ACTIVE_MODEL)
print("Memanaskan model ke GPU...")
requests.post(f"{OLLAMA_URL}/api/generate", json={"model": ACTIVE_MODEL, "prompt": "Hi", "stream": False, "keep_alive": -1}, timeout=900).raise_for_status()

# %% [code]
# CELL 5 - TUNNEL + LAPOR URL (satu penjaga: hidupkan ulang tunnel/ollama & lapor tiap 60 detik)
import re
from urllib.parse import quote
TUNNEL_LOG = "/kaggle/working/cloudflared.log"
REG_KEY = f"foundry:ai-url:{ACCOUNT_ID}"
STATE = {"url": None}

def start_tunnel():
    log = open(TUNNEL_LOG, "w")
    return subprocess.Popen(["cloudflared", "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", OLLAMA_URL], stdout=log, stderr=log)

def last_url():
    try:
        found = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", open(TUNNEL_LOG).read())
        return found[-1] if found else None
    except Exception: return None

def upstash(path):
    if UPSTASH_URL.startswith("__"): return
    try: requests.post(f"{UPSTASH_URL}/{path}", headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"}, timeout=10)
    except Exception as e: print("Gagal lapor:", e, flush=True)

def guard():
    p, n = None, 0
    while True:
        if not ollama_ok():
            upstash(f"del/{quote(REG_KEY, safe='')}")   # jangan arahkan orang ke server mati
            print("[guard] Ollama mati -> hidupkan ulang", flush=True); start_ollama()
        if p is None or p.poll() is not None:
            p = start_tunnel(); STATE["url"] = None
            print("[guard] tunnel dinyalakan", flush=True)
            time.sleep(10)
        url = last_url()
        if url and url != STATE["url"]:
            STATE["url"] = url
            print(f"{'='*60}\nAKUN {ACCOUNT_ID} URL: {url}\n{'='*60}", flush=True)
        if url and ollama_ok():
            upstash(f"set/{quote(REG_KEY, safe='')}/{quote(url, safe='')}?EX=180")
        n += 1
        if n % 5 == 0: print(f"[{n} menit] hidup | {STATE['url']}", flush=True)
        time.sleep(60)

threading.Thread(target=guard, daemon=True).start()
for _ in range(60):
    if STATE["url"]: break
    time.sleep(2)
print("URL AKTIF:", STATE["url"])

# %% [code]
# CELL 6 - JAGA SESI HIDUP (sampai batas 12 jam Kaggle; GitHub Actions akan menyalakan lagi)
while True:
    time.sleep(300)
