/**
 * Penyimpanan secret di browser. Nilai dienkripsi AES-GCM dengan kunci
 * non-extractable yang disimpan di IndexedDB, jadi nilai mentah tidak pernah
 * ditulis ke localStorage dan tidak bisa diekspor dari kunci.
 */
import { useSyncExternalStore } from "react";

export type SecretMeta = {
  name: string;
  service: string;
  length: number;
  createdAt: number;
  updatedAt: number;
  lastTest?: { status: TestStatus; account?: string | undefined; detail?: string | undefined; at: number } | undefined;
};
export type TestStatus = "active" | "invalid" | "unknown" | "error";
type StoredSecret = SecretMeta & { iv: number[]; data: number[] };

const DB = "wengpt-secrets";
const STORE = "secrets";
const KEY_STORE = "keys";
export const SECRET_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

let metas: SecretMeta[] = [];
let values = new Map<string, string>();
let ready = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "name" });
      req.result.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function cryptoKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(db, KEY_STORE, "readonly", (s) => s.get("main"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await tx(db, KEY_STORE, "readwrite", (s) => s.put(key, "main"));
  return key;
}

export function guessService(name: string) {
  const n = name.toUpperCase();
  const map: [RegExp, string][] = [
    [/GITHUB|GH_/, "github"],
    [/VERCEL/, "vercel"],
    [/OPENAI/, "openai"],
    [/ANTHROPIC|CLAUDE/, "anthropic"],
    [/GROQ/, "groq"],
    [/GEMINI|GOOGLE_AI/, "gemini"],
    [/HF_|HUGGING/, "huggingface"],
    [/TELEGRAM/, "telegram"],
    [/STRIPE/, "stripe"],
    [/NETLIFY/, "netlify"],
    [/CLOUDFLARE|CF_/, "cloudflare"],
    [/E2B/, "e2b"],
    [/OPENROUTER/, "openrouter"],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? "lainnya";
}

export const SERVICE_LABEL: Record<string, string> = {
  github: "GitHub",
  vercel: "Vercel",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  gemini: "Google Gemini",
  huggingface: "Hugging Face",
  telegram: "Telegram Bot",
  stripe: "Stripe",
  netlify: "Netlify",
  cloudflare: "Cloudflare",
  e2b: "E2B",
  openrouter: "OpenRouter",
  lainnya: "Lainnya",
};

export function loadSecrets() {
  if (ready || typeof window === "undefined") return Promise.resolve();
  loading ??= (async () => {
    try {
      const db = await openDb();
      const key = await cryptoKey(db);
      const rows = await tx<StoredSecret[]>(db, STORE, "readonly", (s) => s.getAll());
      const next = new Map<string, string>();
      for (const row of rows) {
        try {
          const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(row.iv) },
            key,
            new Uint8Array(row.data),
          );
          next.set(row.name, new TextDecoder().decode(plain));
        } catch {
          /* kunci hilang: lewati */
        }
      }
      values = next;
      metas = rows
        .filter((r) => next.has(r.name))
        .map(({ iv: _iv, data: _data, ...meta }) => meta)
        .sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      ready = true;
      emit();
    }
  })();
  return loading;
}

async function persist(meta: SecretMeta, value: string) {
  const db = await openDb();
  const key = await cryptoKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)),
  );
  await tx(db, STORE, "readwrite", (s) => s.put({ ...meta, iv: [...iv], data: [...data] }));
}

export async function saveSecret(name: string, value: string, service?: string) {
  await loadSecrets();
  const clean = name.trim().toUpperCase();
  if (!SECRET_NAME.test(clean)) throw new Error("Nama secret hanya huruf besar, angka, dan _.");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Nilai secret tidak boleh kosong.");
  if (trimmed.length > 8000) throw new Error("Nilai secret terlalu panjang.");
  const now = Date.now();
  const prev = metas.find((m) => m.name === clean);
  const meta: SecretMeta = {
    name: clean,
    service: service || prev?.service || guessService(clean),
    length: trimmed.length,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await persist(meta, trimmed);
  values.set(clean, trimmed);
  metas = [...metas.filter((m) => m.name !== clean), meta].sort((a, b) => a.name.localeCompare(b.name));
  emit();
  return meta;
}

export async function deleteSecret(name: string) {
  const db = await openDb();
  await tx(db, STORE, "readwrite", (s) => s.delete(name));
  values.delete(name);
  metas = metas.filter((m) => m.name !== name);
  emit();
}

export async function recordTest(name: string, result: SecretMeta["lastTest"]) {
  const meta = metas.find((m) => m.name === name);
  const value = values.get(name);
  if (!meta || !value) return;
  const next = { ...meta, lastTest: result };
  metas = metas.map((m) => (m.name === name ? next : m));
  emit();
  await persist(next, value);
}

export async function testSecret(name: string) {
  const value = values.get(name);
  const meta = metas.find((m) => m.name === name);
  if (!value || !meta) throw new Error("Secret tidak ditemukan.");
  const res = await fetch("/api/secret-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, service: meta.service, value }),
  });
  const body = (await res.json()) as { status: TestStatus; account?: string; detail?: string };
  const result = { ...body, at: Date.now() };
  await recordTest(name, result);
  return result;
}

/** Dikirim ke server chat agar AI bisa memakai/menguji secret tanpa melihat nilainya. */
export function secretPayload() {
  return metas.map((m) => ({ name: m.name, service: m.service, value: values.get(m.name) ?? "" }));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const EMPTY: { ready: boolean; secrets: SecretMeta[] } = { ready: false, secrets: [] };
let snap = EMPTY;
function getSnap() {
  if (snap.ready !== ready || snap.secrets !== metas) snap = { ready, secrets: metas };
  return snap;
}
export function useSecrets() {
  return useSyncExternalStore(subscribe, getSnap, () => EMPTY);
}
