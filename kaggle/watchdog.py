# Watchdog Foundry: dijalankan GitHub Actions tiap 10 menit.
# Per akun: (1) sesi Kaggle mati -> nyalakan ulang, (2) sesi hidup tapi AI tidak menjawab -> nyalakan ulang.
import json, os, subprocess, sys, tempfile, time
from urllib.parse import quote
import requests

UPSTASH_URL = os.environ.get("UPSTASH_URL", "").rstrip("/")
UPSTASH_TOKEN = os.environ.get("UPSTASH_TOKEN", "")
SLUG = "foundry-ai-server"
DATASET = "kztutorial/rvn-cache"
WARMUP_MIN = 45          # beri waktu sesi baru memuat model sebelum dianggap macet
FAILS_TO_RESTART = 2     # 2x cek gagal berturut-turut (~20 menit) baru restart
SCRIPT = os.path.join(os.path.dirname(__file__), "foundry_kaggle.py")


def redis(*cmd):
    if not UPSTASH_URL: return None
    try:
        r = requests.post(UPSTASH_URL, headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"}, json=list(cmd), timeout=10)
        return r.json().get("result")
    except Exception as e:
        print("  upstash error:", e); return None


def kaggle_get(user, key, path, **params):
    r = requests.get(f"https://www.kaggle.com/api/v1/{path}", params=params, auth=(user, key), timeout=30)
    r.raise_for_status(); return r.json()


def ai_answers(url):
    try:
        tags = requests.get(f"{url}/api/tags", timeout=20).json().get("models", [])
        if not tags: return False
        model = next((m["name"] for m in tags if m["name"].startswith("rvn27b")), tags[0]["name"])
        r = requests.post(f"{url}/api/generate", timeout=150,
                          json={"model": model, "prompt": "ok", "stream": False, "options": {"num_predict": 1}})
        return r.status_code == 200 and "response" in r.json()
    except Exception as e:
        print("  tes AI error:", str(e)[:150]); return False


def restart(acc_id, user, key):
    src = open(SCRIPT).read()
    src = (src.replace('"__ACCOUNT_ID__"', json.dumps(acc_id))
              .replace('"__UPSTASH_URL__"', json.dumps(UPSTASH_URL))
              .replace('"__UPSTASH_TOKEN__"', json.dumps(UPSTASH_TOKEN)))
    d = tempfile.mkdtemp()
    open(f"{d}/foundry_kaggle.py", "w").write(src)
    json.dump({"id": f"{user}/{SLUG}", "title": SLUG, "code_file": "foundry_kaggle.py", "language": "python",
               "kernel_type": "script", "is_private": True, "enable_gpu": True, "enable_internet": True,
               "machine_shape": "NvidiaTeslaT4", "dataset_sources": [DATASET],
               "competition_sources": [], "kernel_sources": [], "model_sources": []},
              open(f"{d}/kernel-metadata.json", "w"))
    env = dict(os.environ, KAGGLE_USERNAME=user, KAGGLE_KEY=key)
    r = subprocess.run(["kaggle", "kernels", "push", "-p", d], env=env, text=True, capture_output=True)
    print("  push:", (r.stdout + r.stderr).strip()[-400:])
    redis("SET", f"foundry:restart-at:{acc_id}", str(int(time.time())), "EX", 7200)
    redis("DEL", f"foundry:watchdog:fail:{acc_id}")
    return r.returncode == 0


def check(acc_id, user, key):
    print(f"== Akun {acc_id} ({user})")
    try:
        status = kaggle_get(user, key, "kernels/status", userName=user, kernelSlug=SLUG).get("status", "")
    except Exception as e:
        print("  gagal cek status:", e); return
    print("  status sesi:", status)
    if status not in ("running", "queued"):
        print("  -> sesi mati, nyalakan ulang"); restart(acc_id, user, key); return
    if status == "queued":
        return
    # Sesi hidup: pastikan AI benar-benar menjawab.
    # lastRunTime dari Kaggle sering masih menunjuk run lama, jadi masa pemanasan
    # dihitung dari waktu restart terakhir yang kita catat sendiri di Redis.
    now = int(time.time())
    url = redis("GET", f"foundry:ai-url:{acc_id}")
    healthy = bool(url) and ai_answers(url)
    print(f"  url={'ada' if url else 'tidak ada'} | AI menjawab={healthy}")
    if healthy:
        redis("DEL", f"foundry:watchdog:fail:{acc_id}"); return
    restart_at = int(redis("GET", f"foundry:restart-at:{acc_id}") or 0)
    if not restart_at:
        redis("SET", f"foundry:restart-at:{acc_id}", str(now), "EX", 7200)
        print("  sesi lama tanpa catatan restart: pemanasan dihitung dari sekarang"); return
    age_min = (now - restart_at) / 60
    print(f"  sejak restart ~{age_min:.0f} menit")
    if age_min < WARMUP_MIN:
        print("  masih pemanasan, tunggu"); return
    fails = int(redis("INCR", f"foundry:watchdog:fail:{acc_id}") or FAILS_TO_RESTART)
    redis("EXPIRE", f"foundry:watchdog:fail:{acc_id}", 3600)
    print(f"  AI tidak menjawab ({fails}/{FAILS_TO_RESTART})")
    if fails >= FAILS_TO_RESTART:
        print("  -> sesi hidup tapi AI mati, nyalakan ulang"); restart(acc_id, user, key)


for i in ("1",):
    u, k = os.environ.get(f"KAGGLE_USERNAME_{i}"), os.environ.get(f"KAGGLE_KEY_{i}")
    if u and k: check(i, u, k)
