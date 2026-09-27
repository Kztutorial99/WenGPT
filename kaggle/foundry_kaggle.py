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

def ollama_has(name):
    # True kalau model sudah terdaftar di Ollama (nama tanpa tag dianggap ":latest")
    try:
        names = [m.get("name", "") for m in requests.get(f"{OLLAMA_URL}/api/tags", timeout=10).json().get("models", [])]
    except Exception:
        return False
    want = name if ":" in name.split("/")[-1] else f"{name}:latest"
    return any(n == name or n == want for n in names)

def start_ollama():
    log = open(LOG_FILE, "a")
    subprocess.Popen(["ollama", "serve"], env=os.environ.copy(), stdout=log, stderr=log)
    for _ in range(90):
        if ollama_ok(): return True
        time.sleep(1)
    return False

def kill_ollama():
    subprocess.run("pkill -9 -f 'ollama serve'; pkill -9 -f 'ollama runner'; pkill -9 -f 'ollama_llama_server'", shell=True)
    time.sleep(3)

if not ollama_ok() and not start_ollama():
    print(open(LOG_FILE).read()[-4000:]); raise RuntimeError("Ollama gagal jalan")
print("OK Ollama jalan")

# %% [code]
# CELL 4 - MODEL (pakai cache dataset; TIDAK pernah ollama pull / download ulang)
ACTIVE_MODEL = "rvn27b"
if ollama_has(MODEL):
    # Cache dataset sudah memuat model + projector penglihatan dari pull sebelumnya.
    ACTIVE_MODEL = MODEL
elif not ollama_has(ACTIVE_MODEL):
    def find_or_download(filename):
        # 1) dari dataset cache 2) dari sisa sesi sebelumnya 3) download SEKALI dari Hugging Face
        for base in [CACHE, "/kaggle/working"]:
            if base:
                hit = glob.glob(f"{base}/gguf/{filename}") + glob.glob(f"{base}/**/{filename}", recursive=True)
                if hit: return hit[0]
        print(f"Download {filename} (sekali saja - nanti pindahkan ke dataset {DATASET}/gguf/ biar tidak download lagi)...")
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(repo_id=HF_REPO, filename=filename)
        os.makedirs("/kaggle/working/gguf", exist_ok=True)
        dest = f"/kaggle/working/gguf/{filename}"
        if not os.path.exists(dest): shutil.copy(path, dest)
        return dest

    gguf = find_or_download(HF_FILE)
    mmproj = find_or_download("mmproj-Qwen3.8-27B-Q8_0.gguf")   # file penglihatan (gambar/screenshot)
    open("/kaggle/working/Modelfile", "w").write(
        f"FROM {gguf}\nMMPROJ {mmproj}\nPARAMETER num_ctx 8192\n")
    if subprocess.run(["ollama", "create", ACTIVE_MODEL, "-f", "/kaggle/working/Modelfile"], env=os.environ.copy()).returncode != 0:
        raise RuntimeError("Gagal membuat model rvn27b")
print("Model:", ACTIVE_MODEL)
print("Memanaskan model ke GPU...")
# Pemanasan DIBATASI 1 token + thinking mati: tanpa ini model 27B bisa generasi lama
# dan sesi terlihat "Running" padahal server belum siap menjawab.
def warm_model():
    try:
        r = requests.post(f"{OLLAMA_URL}/api/generate", timeout=900,
                          json={"model": ACTIVE_MODEL, "prompt": "ok", "stream": False,
                                "keep_alive": -1, "think": False,
                                "options": {"num_predict": 1}})
        return r.status_code == 200
    except Exception as e:
        print("Pemanasan gagal:", str(e)[:200], flush=True); return False
for _attempt in range(3):
    if warm_model(): break
    print(f"Pemanasan ulang ({_attempt+1}/3)...", flush=True); time.sleep(15)
else:
    raise RuntimeError("Model gagal dipanaskan setelah 3 percobaan")
print("Model panas & siap menjawab.", flush=True)

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

def tunnel_ok(url):
    # Cek dari luar lewat alamat publik: proses cloudflared bisa hidup tapi tunnel-nya putus
    try: return requests.get(f"{url}/api/tags", timeout=15).status_code == 200
    except Exception: return False

def ai_ok(timeout=300):
    # Tes NYATA: minta model menjawab 1 token. /api/tags bisa tetap OK walau model macet/GPU hang.
    try:
        r = requests.post(f"{OLLAMA_URL}/api/generate", timeout=timeout,
                          json={"model": ACTIVE_MODEL, "prompt": "ok", "stream": False, "keep_alive": -1,
                                "options": {"num_predict": 1}})
        return r.status_code == 200 and "response" in r.json()
    except Exception as e:
        print("[guard] tes AI gagal:", str(e)[:200], flush=True); return False

def heal_ai():
    # Model tidak menjawab -> matikan Ollama total, hidupkan ulang, panaskan model lagi
    upstash(f"del/{quote(REG_KEY, safe='')}")
    print("[guard] AI tidak menjawab -> restart Ollama + muat ulang model", flush=True)
    kill_ollama()
    if not start_ollama(): return False
    return ai_ok(timeout=900)

def guard():
    p, n, fails, ai_fails, heals = None, 0, 0, 0, 0
    while True:
        if not ollama_ok():
            upstash(f"del/{quote(REG_KEY, safe='')}")   # jangan arahkan orang ke server mati
            print("[guard] Ollama mati -> hidupkan ulang", flush=True); kill_ollama(); start_ollama()
        # Tes jawaban model tiap 3 menit (tidak dilakukan tiap menit supaya tidak mengganggu user)
        if n % 3 == 0:
            if ai_ok():
                ai_fails, heals = 0, 0
            else:
                ai_fails += 1
                print(f"[guard] AI tidak menjawab ({ai_fails}/2)", flush=True)
                if ai_fails >= 2:
                    ai_fails = 0
                    if heal_ai():
                        heals = 0; print("[guard] AI pulih", flush=True)
                    else:
                        heals += 1
                        if heals >= 3:
                            # Tidak bisa dipulihkan dari dalam -> akhiri sesi, watchdog GitHub akan menyalakan ulang
                            upstash(f"del/{quote(REG_KEY, safe='')}")
                            print("[guard] AI gagal pulih 3x -> hentikan sesi agar di-restart otomatis", flush=True)
                            os._exit(1)
        if p is None or p.poll() is not None:
            p = start_tunnel(); STATE["url"] = None; fails = 0
            print("[guard] tunnel dinyalakan", flush=True)
            time.sleep(10)
        url = last_url()
        if url and url != STATE["url"]:
            STATE["url"] = url
            print(f"{'='*60}\nAKUN {ACCOUNT_ID} URL: {url}\n{'='*60}", flush=True)
        if url and ollama_ok() and ai_fails == 0:
            if tunnel_ok(url):
                fails = 0
                upstash(f"set/{quote(REG_KEY, safe='')}/{quote(url, safe='')}?EX=180")
            else:
                fails += 1
                print(f"[guard] tunnel tidak merespons ({fails}/3)", flush=True)
                if fails >= 3:
                    upstash(f"del/{quote(REG_KEY, safe='')}")
                    print("[guard] tunnel putus -> matikan & nyalakan ulang cloudflared", flush=True)
                    try: p.kill()
                    except Exception: pass
                    p = None
        elif not url and p is not None and time.time() - os.path.getmtime(TUNNEL_LOG) > 120:
            print("[guard] tunnel tidak memberi alamat -> nyalakan ulang", flush=True)
            try: p.kill()
            except Exception: pass
            p = None
        n += 1
        if n % 5 == 0: print(f"[{n} menit] hidup | {STATE['url']}", flush=True)
        time.sleep(60)

threading.Thread(target=guard, daemon=True).start()
for _ in range(60):
    if STATE["url"]: break
    time.sleep(2)
print("URL AKTIF:", STATE["url"])

# %% [code]
# CELL 6 - JAGA SESI HIDUP (sampai batas 12 jam Kaggle; watchdog GitHub Actions akan menyalakan lagi)
START = time.time()
while True:
    time.sleep(300)
    # Selesai sendiri sedikit sebelum batas 12 jam supaya watchdog langsung menyalakan sesi baru
    if time.time() - START > 11.5 * 3600:
        upstash(f"del/{quote(REG_KEY, safe='')}")
        print("Hampir 12 jam -> akhiri sesi, watchdog akan menyalakan ulang", flush=True)
        os._exit(0)
