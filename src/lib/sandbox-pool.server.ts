import { Sandbox } from "e2b";

// Simpan koneksi sandbox per isolate supaya input terminal tidak
// membuka koneksi baru di setiap ketikan (penyebab utama lag).
const pool = new Map<string, { sb: Sandbox; at: number }>();
const TTL = 5 * 60_000;

export async function connectSandbox(id: string, apiKey: string) {
  const hit = pool.get(id);
  if (hit && Date.now() - hit.at < TTL) {
    hit.at = Date.now();
    return hit.sb;
  }
  const sb = await Sandbox.connect(id, { apiKey, timeoutMs: 15 * 60_000 });
  pool.set(id, { sb, at: Date.now() });
  return sb;
}

export function dropSandbox(id: string) {
  pool.delete(id);
}
