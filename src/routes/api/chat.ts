import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { Sandbox } from "e2b";
import { verifySecret } from "@/lib/secret-test.server";

import AGENT_INSTRUCTIONS from "../../../AGENT.md?raw";
import AGENT_INSTRUCTIONS from "../../../WEBH.md?raw";

const SYSTEM_PROMPT = AGENT_INSTRUCTIONS.replace(/^<!--[\s\S]*?-->\s*/, "").trim();

// Model kadang menulis pemanggilan tool sebagai teks biasa. Saring sebelum dikirim ke layar.
const TOOL_NAMES = "set_intent|milestone|web_search|read_webpage|run_command|download_file|write_file|read_file|edit_file|list_files|search_code|todo|preview_app|request_secret|list_secrets|test_secret";
const FAKE_TOOL_LINE = new RegExp(`^[ \\t>*_\`\\-]*(?:tool[ _:]*)?\\(?\`?(?:${TOOL_NAMES})\`?\\)?(?:\\s*[:(\\[{]|\\s+(?:selesai|berjalan|dipanggil|done|called|running)\\b|\\s*$).*$`, "gim");
const FAKE_TOOL_JSON = new RegExp(`^\\s*\\{\\s*"(?:name|tool|toolName)"\\s*:\\s*"(?:${TOOL_NAMES})"[\\s\\S]*?\\}\\s*$`, "gim");
function cleanModelText(raw: string, final: boolean) {
  const t = raw;
  const lastNl = t.lastIndexOf("\n");
  let body = final ? t : t.slice(0, lastNl + 1);
  let tail = final ? "" : t.slice(lastNl + 1);
  body = body.replace(FAKE_TOOL_JSON, "").replace(FAKE_TOOL_LINE, "").replace(/\n{3,}/g, "\n\n");
  // Tahan baris terakhir yang mungkin awal dari pola yang disaring.
  if (/^[ \t>*_`]*(t(o(o(l.*)?)?)?|\[(t(h.*)?)?|<(t(h.*)?)?)$/i.test(tail)) tail = "";
  return (body + tail).replace(/^\s+/, "");
}

// Pisahkan proses berpikir model (<think>…</think> atau [thinking:…]) dari jawaban.
// Blok yang belum tertutup tetap dialirkan sebagai thinking supaya terlihat langsung.
function splitThink(raw: string) {
  let rest = raw;
  let think = "";
  rest = rest.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner: string) => {
    think += inner;
    return "";
  });
  rest = rest.replace(/\[thinking:([\s\S]*?)\]/gi, (_m, inner: string) => {
    think += inner;
    return "";
  });
  const open = rest.search(/<think>|\[thinking:/i);
  if (open >= 0) {
    think += rest.slice(open).replace(/^(<think>|\[thinking:?)/i, "");
    rest = rest.slice(0, open);
  }
  return { think, rest };
}

const SECRET_GUESS: [RegExp, string, string][] = [
  [/github|gh\b/i, "GITHUB_TOKEN", "github"],
  [/vercel/i, "VERCEL_TOKEN", "vercel"],
  [/openai/i, "OPENAI_API_KEY", "openai"],
  [/anthropic|claude/i, "ANTHROPIC_API_KEY", "anthropic"],
  [/groq/i, "GROQ_API_KEY", "groq"],
  [/gemini|google ai/i, "GEMINI_API_KEY", "gemini"],
  [/hugging ?face|\bhf\b/i, "HF_TOKEN", "huggingface"],
  [/telegram/i, "TELEGRAM_BOT_TOKEN", "telegram"],
  [/stripe/i, "STRIPE_SECRET_KEY", "stripe"],
  [/netlify/i, "NETLIFY_TOKEN", "netlify"],
  [/cloudflare/i, "CLOUDFLARE_API_TOKEN", "cloudflare"],
  [/openrouter/i, "OPENROUTER_API_KEY", "openrouter"],
  [/e2b/i, "E2B_API_KEY", "e2b"],
];

// Pola format token resmi. Dipakai HANYA untuk memberi tahu jika token tidak sesuai format/panjang.
const TOKEN_FORMAT: Record<string, { test: RegExp; hint: string }> = {
  github: { test: /^(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})$/, hint: "Token GitHub biasanya diawali ghp_ (40 karakter) atau github_pat_ (93 karakter)." },
  vercel: { test: /^[A-Za-z0-9]{24}$|^vc[a-z]_[A-Za-z0-9]{20,}$/, hint: "Token Vercel biasanya 24 karakter alfanumerik." },
  openai: { test: /^sk-[A-Za-z0-9_-]{20,}$/, hint: "Key OpenAI diawali sk-." },
  anthropic: { test: /^sk-ant-[A-Za-z0-9_-]{20,}$/, hint: "Key Anthropic diawali sk-ant-." },
  groq: { test: /^gsk_[A-Za-z0-9]{40,}$/, hint: "Key Groq diawali gsk_ (56 karakter)." },
  gemini: { test: /^AIza[A-Za-z0-9_-]{35}$/, hint: "Key Gemini diawali AIza (39 karakter)." },
  huggingface: { test: /^hf_[A-Za-z0-9]{30,}$/, hint: "Token Hugging Face diawali hf_." },
  telegram: { test: /^\d{6,12}:[A-Za-z0-9_-]{35}$/, hint: "Token bot Telegram berformat angka:35 karakter." },
  stripe: { test: /^(sk|rk)_(live|test)_[A-Za-z0-9]{20,}$/, hint: "Key Stripe diawali sk_live_ / sk_test_." },
  openrouter: { test: /^sk-or-[A-Za-z0-9_-]{20,}$/, hint: "Key OpenRouter diawali sk-or-." },
  e2b: { test: /^e2b_[A-Za-z0-9]{20,}$/, hint: "Key E2B diawali e2b_." },
};
function formatWarning(service: string, value: string) {
  const f = TOKEN_FORMAT[service];
  return f && !f.test.test(value.trim()) ? f.hint : undefined;
}

// The "address book": the Kaggle notebook reports its current tunnel URL to a
// tiny free Redis (Upstash REST) every time it restarts. We read the freshest
// URL from there on every chat request, so the app survives tunnel restarts
// with no manual config changes. Falls back to the static AI_BASE_URL secret.
// Several Kaggle accounts each report their own key; the first live one wins.
const REGISTRY_KEYS = [
  "foundry:ai-url:1",
  "foundry:ai-url:2",
  "foundry:ai-url:3",
  "foundry:ai-url",
];

const withV1 = (u: string) => {
  const base = u.replace(/\/+$/, "");
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
};

async function isAlive(v1Base: string): Promise<boolean> {
  try {
    const res = await fetch(`${v1Base}/models`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Cache the resolved URL for a short time so each message doesn't wait on
// registry + health checks before the model even starts.
let cachedUrl: { url: string; at: number } | null = null;
const CACHE_MS = 60_000;

async function resolveAiBaseUrl(): Promise<string> {
  if (cachedUrl && Date.now() - cachedUrl.at < CACHE_MS) return cachedUrl.url;
  const url = await resolveAiBaseUrlUncached();
  cachedUrl = { url, at: Date.now() };
  return url;
}

async function resolveAiBaseUrlUncached(): Promise<string> {
  const fallback = withV1(process.env["AI_BASE_URL"] || "https://api.openai.com/v1");
  const regUrl = process.env["AI_REGISTRY_URL"];
  const regToken = process.env["AI_REGISTRY_TOKEN"];
  if (!regUrl || !regToken) return fallback;

  try {
    const path = REGISTRY_KEYS.map(encodeURIComponent).join("/");
    const res = await fetch(`${regUrl.replace(/\/+$/, "")}/mget/${path}`, {
      headers: { Authorization: `Bearer ${regToken}` },
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as { result?: (string | null)[] };
    const candidates = [
      ...new Set((data.result ?? []).filter((u): u is string => !!u).map(withV1)),
    ];
    if (candidates.length) {
      // Check all at once; pick the first account (in order) that answers.
      const alive = await Promise.all(candidates.map(isAlive));
      const idx = alive.indexOf(true);
      return candidates[idx >= 0 ? idx : 0] ?? fallback;
    }
  } catch {
    // Registry unreachable — use the static URL instead.
  }
  return fallback;
}

const SANDBOX_HOME = "/home/user";
const FORBIDDEN_PATHS = ["/etc/shadow", "/etc/passwd", "/etc/sudoers", "/root/.ssh", "/root/.aws", "/home/user/.ssh", "/home/user/.aws", "/proc/", "/sys/"];
const FORBIDDEN_CMD = /\b(cat|head|tail|less|more|strings)\s+[^|]*\/(etc\/(shadow|passwd)|root\/)|\/proc\/[0-9*]+\/environ|\.ssh\b|\.aws\b|sudo\b(?!\s+apt-get)/;

function sandboxPath(raw: string): string | { error: string } {
  const clean = raw.trim().replace(/^~\/?/, "");
  const p = clean.startsWith("/") ? clean : `${SANDBOX_HOME}/${clean.replace(/^\.\//, "")}`;
  const parts = p.split("/");
  if (parts.includes("..")) return { error: "Path tidak boleh memakai .." };
  if (!p.startsWith(SANDBOX_HOME)) return { error: "Akses di luar folder kerja sandbox ditolak" };
  if (FORBIDDEN_PATHS.some((f) => p.startsWith(f))) return { error: "Path ini berisi kredensial sistem, akses ditolak" };
  return p;
}

function checkCommand(command: string): string | null {
  if (FORBIDDEN_CMD.test(command)) return "Perintah ini menyentuh kredensial/area sistem yang diblokir";
  return null;
}
const clip = (s: string, n = 6000) =>
  s.length > n ? s.slice(0, n) + `\n...[dipotong ${s.length - n} karakter]` : s;

// Diff baris sederhana: potong awalan & akhiran yang sama, sisanya = bagian yang berubah.
function lineDiff(oldText: string, newText: string) {
  const a = oldText ? oldText.split("\n") : [];
  const b = newText.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const removed = a.slice(pre, a.length - suf);
  const added = b.slice(pre, b.length - suf);
  const start = pre + 1;
  const end = Math.max(start, pre + added.length);
  const body = [
    `@@ L${start}${end > start ? `–${end}` : ""} @@`,
    ...removed.slice(0, 200).map((l) => `-${l}`),
    ...added.slice(0, 200).map((l) => `+${l}`),
  ].join("\n");
  return { ranges: [[start, end]] as [number, number][], diff: body.slice(0, 20000), added: added.length, removed: removed.length };
}

// Ambil lokasi error compiler/runtime: file.ext:42 atau file.ext:42:7
function errorLocations(text: string) {
  const out: { file: string; line: number }[] = [];
  const re = /([A-Za-z0-9_./-]+\.(?:c|cc|cpp|cxx|h|hpp|py|js|jsx|ts|tsx|java|kt|rs|go|rb|php|cs|swift|vue|svelte|json|html|css))[:(](\d{1,6})/g;
  for (const m of text.matchAll(re)) {
    const loc = { file: m[1]!, line: Number(m[2]) };
    if (!out.some((o) => o.file === loc.file && o.line === loc.line)) out.push(loc);
    if (out.length >= 10) break;
  }
  return out;
}

const hashOp = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

type Ev =
  | { t: "text"; v: string }
  | { t: "think"; v: string }
  | { t: "sandbox"; id: string }
  | { t: "sandbox_reset" }
  | { t: "tool"; id: string; name: string; input: unknown; at: number }
  | { t: "result"; id: string; output: unknown; at: number; durationMs: number }
  | { t: "error"; v: string }
  | { t: "status"; state: string; label?: string; detail?: string | undefined }
  | { t: "milestone"; id: string; title: string; status: "pending" | "running" | "done" | "failed" | "attention"; detail?: string | undefined }
  | { t: "file"; path: string; op: "create" | "edit" | "write"; ranges: [number, number][]; diff: string; added: number; removed: number; opId: string }
  | { t: "hb" }
  | { t: "task"; taskId: string; resumed: boolean }
  | { t: "done"; ok: boolean; state: string; reasons: string[] };

const streamHeaders = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
};

function chatError(message: string) {
  return new Response(`${JSON.stringify({ t: "error", v: message } satisfies Ev)}\n`, {
    status: 200,
    headers: streamHeaders,
  });
}

async function listDirs(sb: Sandbox): Promise<string[]> {
  try {
    const r = await sb.commands.run(
      "find /home/user -mindepth 1 -maxdepth 4 -type d -not -path '*/.*' -not -path '*/node_modules*' -not -path '*/__pycache__*' -not -path '*/site-packages*' 2>/dev/null | head -200",
      { timeoutMs: 10_000 },
    );
    return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function decodeHtml(t: string) {
  return t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
type WebHit = { title: string; url: string; snippet: string; site: string };
const hit = (title: string, url: string, snippet: string): WebHit | null => {
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js|bing\.com\/aclick/.test(url)) return null;
  let site = "";
  try { site = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return { title: decodeHtml(title).slice(0, 160), url, snippet: decodeHtml(snippet).slice(0, 320), site };
};
// Firecrawl: pencarian + pembaca situs yang tembus JavaScript/anti-bot. Aktif bila FIRECRAWL_API_KEY ada.
async function firecrawl(path: string, payload: unknown, timeout: number) {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(`https://api.firecrawl.dev/v2/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await res.json()) as any;
    }
    const message = (await res.text()).slice(0, 500);
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const retryHeader = Number(res.headers.get("retry-after"));
      const retryFromBody = Number(message.match(/retry after (\d+)s/i)?.[1]);
      const waitSeconds = Number.isFinite(retryHeader)
        ? retryHeader
        : Number.isFinite(retryFromBody)
          ? retryFromBody
          : 2;
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(waitSeconds, 1), 20) * 1000));
      continue;
    }
    if (res.status === 429) {
      console.warn(`Firecrawl ${path} dibatasi setelah percobaan ulang: ${message}`);
      throw new Error("Batas pencarian Firecrawl sedang penuh. Tunggu sekitar 20 detik lalu coba lagi.");
    }
    console.error(`Firecrawl ${path} gagal (${res.status}): ${message}`);
    throw new Error(`Firecrawl ${res.status}: ${message}`);
  }
  throw new Error("Firecrawl gagal setelah dicoba ulang.");
}
async function searchFirecrawl(query: string, max: number) {
  const data = await firecrawl("search", { query, limit: max }, 30_000);
  if (!data) throw new Error("Firecrawl belum aktif");
  const list = Array.isArray(data.data)
    ? data.data
    : [...(data.data?.web ?? []), ...(data.data?.news ?? [])];
  const out: WebHit[] = [];
  for (const r of list) {
    const h = hit(r.title ?? r.url ?? "", r.url ?? "", r.description ?? "");
    if (h) out.push(h);
  }
  if (!out.length) throw new Error("Firecrawl tidak mengembalikan hasil untuk kata kunci ini.");
  return out;
}
const searchCache = new Map<string, { at: number; results: WebHit[] }>();
async function webSearch(query: string, max = 6) {
  const year = new Date().getUTCFullYear();
  const recent = /\b(latest|newest|current|recent|update|version|terbaru|terkini|versi|pembaruan)\b/i.test(query);
  // Models sometimes carry a stale year from their training data into a "latest" search.
  const freshQuery = recent
    ? `${query.replace(/\b20\d{2}\b/g, (value) => Number(value) < year ? String(year) : value).trim()}${/\b20\d{2}\b/.test(query) ? "" : ` ${year}`}`
    : query;
  const key = freshQuery.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.results;
  // Satu-satunya mesin pencari: Firecrawl (tembus JavaScript/anti-bot).
  // Firecrawl sudah mengurutkan hasil berdasarkan relevansi. Jangan menyaring
  // ulang hanya dari judul karena hasil valid sering memakai sinonim atau judul singkat.
  const results = await searchFirecrawl(freshQuery, max);
  if (results.length) searchCache.set(key, { at: Date.now(), results });
  return results;
}
async function readWebpage(url: string) {
  try {
    const data = await firecrawl("scrape", { url, formats: ["markdown"], onlyMainContent: true }, 30_000);
    const doc = data?.data ?? data;
    if (doc?.markdown)
      return { ok: true, url: doc.metadata?.sourceURL || url, title: doc.metadata?.title ?? "", text: String(doc.markdown).slice(0, 8000) };
  } catch {
    /* lanjut ke pembacaan biasa */
  }
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000), redirect: "follow" });
  if (!res.ok) return { ok: false, url: res.url || url, error: `Situs membatasi pembacaan otomatis (${res.status}). Gunakan cuplikan pencarian atau sumber lain.` };
  const html = await res.text();
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (/attention required|just a moment|access denied|captcha/i.test(title))
    return { ok: false, url: res.url || url, error: "Situs membatasi pembacaan otomatis. Gunakan cuplikan pencarian atau sumber lain." };
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n");
  const text = decodeHtml(body.replace(/\n/g, " \u2029 ")).replace(/ ?\u2029 ?/g, "\n").replace(/\n{2,}/g, "\n");
  return { ok: res.ok, url: res.url || url, title, text: text.slice(0, 8000) };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["AI_API_KEY"];
        if (!apiKey) return chatError("Layanan AI belum siap. Silakan coba lagi sebentar.");

        type SharedFile = { path: string; content: string };
        type Attachment = { path: string; mediaType: string; size: number; dataUrl: string };
        let body: {
          messages: UIMessage[];
          sandboxId?: string | null;
          files?: SharedFile[];
          attachments?: Attachment[];
          secrets?: { name: string; service: string; value: string }[];
          taskId?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return chatError("Pesan tidak dapat dibaca. Silakan kirim ulang.");
        }
        if (!Array.isArray(body.messages))
          return chatError("Riwayat percakapan tidak valid. Silakan buat sesi baru.");
        const attachmentSchema = z.object({
          path: z.string().regex(/^\/home\/user\/attached_assets\/[a-zA-Z0-9._ -]{1,160}$/),
          mediaType: z.string().max(200),
          size: z
            .number()
            .int()
            .nonnegative()
            .max(20 * 1024 * 1024),
          dataUrl: z.string().max(28 * 1024 * 1024),
        });
        const attachmentResult = z
          .array(attachmentSchema)
          .max(10)
          .safeParse(body.attachments ?? []);
        if (!attachmentResult.success)
          return chatError("Lampiran tidak valid atau melebihi batas 20 MB.");
        const secrets = z
          .array(
            z.object({
              name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/),
              service: z.string().max(40),
              value: z.string().max(8000),
            }),
          )
          .max(50)
          .catch([])
          .parse(body.secrets ?? []);
        const secretEnvs = Object.fromEntries(secrets.map((s) => [s.name, s.value]));
        const redact = (text: string) =>
          secrets.reduce(
            (out, s) => (s.value.length >= 6 ? out.split(s.value).join(`[SECRET:${s.name}]`) : out),
            text,
          );
        const baseURL = await resolveAiBaseUrl();
        // openai-compatible membaca reasoning_content sehingga thinking benar-benar dialirkan.
        const provider = createOpenAICompatible({ name: "openai", apiKey, baseURL: baseURL ?? "https://api.openai.com/v1" });
        const model = process.env["AI_MODEL"] || "gpt-4o-mini";
        const today = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

        const encoder = new TextEncoder();
        let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
        const taskId = typeof body.taskId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(body.taskId) ? body.taskId : `task-${Date.now().toString(36)}`;
        let seq = 0;
        const eventLog: string[] = [];
        const emit = (e: Ev) => {
          const line = JSON.stringify({ ...e, seq: ++seq, ts: Date.now() });
          if (e.t !== "hb" && e.t !== "text") eventLog.push(line);
          try {
            controllerRef?.enqueue(encoder.encode(line + "\n"));
          } catch {
            /* stream browser sudah tertutup; pekerjaan tetap dicatat */
          }
        };

        let sandbox: Sandbox | null = null;
        const getSandbox = async () => {
          if (sandbox) return sandbox;
          const e2bKey = process.env["E2B_API_KEY"];
          if (!e2bKey) throw new Error("E2B_API_KEY belum diatur");
          let reset = false;
          if (body.sandboxId) {
            try {
              sandbox = await Sandbox.connect(body.sandboxId, {
                apiKey: e2bKey,
                timeoutMs: 15 * 60_000,
              });
            } catch {
              sandbox = null;
              reset = true;
            }
          }
          if (!sandbox) sandbox = await Sandbox.create({ apiKey: e2bKey, timeoutMs: 15 * 60_000 });
          const shared = Array.isArray(body.files) ? body.files.slice(0, 40) : [];
          await Promise.all(
            shared.map(async (f) => {
              try {
                if (
                  typeof f?.path !== "string" ||
                  typeof f?.content !== "string" ||
                  f.content.length > 200_000
                )
                  return;
                if (!(await sandbox!.files.exists(f.path)))
                  await sandbox!.files.write(f.path, f.content);
              } catch {
                /* abaikan file yang gagal dipulihkan */
              }
            }),
          );
          await Promise.all(
            attachmentResult.data.map(async (file) => {
              const comma = file.dataUrl.indexOf(",");
              if (comma < 0) throw new Error(`Isi ${file.path} tidak valid.`);
              const bytes = await (await fetch(file.dataUrl)).arrayBuffer();
              if (bytes.byteLength !== file.size || bytes.byteLength > 20 * 1024 * 1024)
                throw new Error(`Ukuran ${file.path} tidak valid.`);
              await sandbox!.files.write(file.path, bytes);
            }),
          );
          if (reset) emit({ t: "sandbox_reset" });
          emit({ t: "sandbox", id: sandbox.sandboxId });
          return sandbox;
        };

        let searchCalls = 0;
        const readFiles = new Set<string>();
        const todoState: { items: { text: string; done: boolean }[] } = { items: [] };
        // ===== State agent (checkpoint) =====
        type Ckpt = {
          taskId: string;
          sessionHint: string;
          state: string;
          milestones: { id: string; title: string; status: string; detail?: string | undefined }[];
          lastOpId: string | null;
          lastOp: string | null;
          ops: Record<string, { name: string; ok: boolean; summary: string; at: number }>;
          files: { path: string; op: string; ranges: [number, number][]; diff: string; opId: string; at: number }[];
          lastTest: { command: string; exitCode: number; at: number } | null;
          lastError: { message: string; locations: { file: string; line: number }[]; at: number } | null;
          updatedAt: number;
        };
        const ckptDir = "/home/user/.wengpt";
        const ckptPath = `${ckptDir}/checkpoint-${taskId}.json`;
        let ckpt: Ckpt = {
          taskId, sessionHint: "", state: "UNDERSTANDING", milestones: [], lastOpId: null, lastOp: null,
          ops: {}, files: [], lastTest: null, lastError: null, updatedAt: Date.now(),
        };
        let resumed = false;
        // Cepat: sambung ke sandbox hanya saat melanjutkan tugas, bukan di tiap pesan baru.
        const wantsResume = JSON.stringify(body.messages?.at?.(-1) ?? "").includes("dihentikan pengguna sebelum selesai");
        if (body.sandboxId && wantsResume) {
          try {
            const sb = await getSandbox();
            if (await sb.files.exists(ckptPath).catch(() => false)) {
              ckpt = { ...ckpt, ...(JSON.parse(await sb.files.read(ckptPath)) as Ckpt) };
              resumed = true;
            }
          } catch {
            /* tidak ada checkpoint lama */
          }
        }
        let intent: "unknown" | "clear" | "need_clarification" = resumed ? "clear" : "unknown";
        let commandRunning = 0;
        let unresolvedError = false;
        const setState = (state: string, detail?: string) => {
          if (ckpt.state === state && !detail) return;
          ckpt.state = state;
          const labels: Record<string, string> = {
            UNDERSTANDING: "Memahami kebutuhan", WAITING_FOR_CLARIFICATION: "Menunggu jawaban Anda", PLANNING: "Merencanakan",
            EXECUTING: "Mengerjakan project", TESTING: "Menguji aplikasi", FIXING: "Memperbaiki error", PREVIEWING: "Menyiapkan pratinjau",
            COMPLETED: "Selesai", FAILED: "Pekerjaan berhenti karena error", ATTENTION: "Perlu perhatian",
          };
          emit({ t: "status", state, label: labels[state] ?? state, detail });
        };
        const saveCkpt = async () => {
          if (!sandbox) return;
          ckpt.updatedAt = Date.now();
          try {
            await sandbox.files.write(ckptPath, JSON.stringify(ckpt));
          } catch {
            /* checkpoint gagal disimpan tidak menghentikan pekerjaan */
          }
        };
        const MS_TITLES: Record<string, string> = {
          understand: "Memahami kebutuhan", setup: "Menyiapkan project", implement: "Implementasi",
          test: "Pengujian", fix: "Memperbaiki error", finish: "Penyelesaian",
        };
        const canonMs = (id: string, title: string): string | null => {
          const t = `${id} ${title}`.toLowerCase();
          if (/^\s*(simpan|tulis|baca|buka|jalankan|run|write|read|edit|save|file|perintah|command)\b/.test(title.toLowerCase())) return null;
          if (/perbaik|fix|debug|error/.test(t)) return "fix";
          if (/tes|test|uji|verif|compile|build/.test(t)) return "test";
          if (/selesai|final|preview|pratinjau|laporan|finish|deliver/.test(t)) return "finish";
          if (/siap|setup|install|init|struktur|scaffold|depend/.test(t)) return "setup";
          if (/analis|paham|kebutuh|understand|rencana|plan/.test(t)) return "understand";
          return "implement";
        };
        const setMs = (id: string, status: string, detail?: string) => {
          const title = MS_TITLES[id] ?? id;
          const m = ckpt.milestones.find((x) => x.id === id);
          if (m && m.status === status && !detail) return;
          if (status === "running")
            for (const o of ckpt.milestones)
              if (o.id !== id && o.status === "running" && !(id === "fix" && o.id === "test")) {
                o.status = "done";
                emit({ t: "milestone", id: o.id, title: o.title, status: "done" });
              }
          if (m) Object.assign(m, { title, status, detail });
          else ckpt.milestones.push({ id, title, status, detail });
          emit({ t: "milestone", id, title, status: status as "running", detail });
        };
        const MUTATING = new Set(["write_file", "edit_file", "run_command", "preview_app"]);
        const gate = (name: string) =>
          MUTATING.has(name) && intent === "need_clarification"
            ? { ok: false, error: "Ditolak: permintaan masih perlu klarifikasi. Ajukan pertanyaan ke pengguna dulu, jangan jalankan alat pengubah proyek." }
            : null;
        const recordOp = async (opId: string, name: string, ok: boolean, summary: string) => {
          ckpt.ops[opId] = { name, ok, summary: summary.slice(0, 300), at: Date.now() };
          if (ok) {
            ckpt.lastOpId = opId;
            ckpt.lastOp = `${name}: ${summary.slice(0, 200)}`;
          }
          void saveCkpt();
        };
        const doneOp = (opId: string) => ckpt.ops[opId]?.ok === true;
        const emitFile = (path: string, op: "create" | "edit" | "write", oldText: string, newText: string, opId: string) => {
          const d = lineDiff(oldText, newText);
          if (!["test", "fix"].some((k) => ckpt.milestones.find((m) => m.id === k && m.status === "running")))
            setMs("implement", "running");
          ckpt.files.push({ path, op, ranges: d.ranges, diff: d.diff, opId, at: Date.now() });
          if (ckpt.files.length > 200) ckpt.files.splice(0, ckpt.files.length - 200);
          emit({ t: "file", path, op, ranges: d.ranges, diff: d.diff, added: d.added, removed: d.removed, opId });
          return d;
        };
        const commandDetail = (command: string, kind: "setup" | "implement" | "test") => {
          const file = command.match(/(?:^|\s)(?:\/home\/user\/)?([\w./-]+\.[A-Za-z0-9]+)(?:\s|$)/)?.[1]?.split("/").pop();
          if (kind === "test") return file ? `Menguji ${file}` : "Menjalankan pengujian";
          if (kind === "setup") return "Menyiapkan kebutuhan project";
          return file ? `Mengubah ${file}` : "Memperbarui project";
        };
        const tools = {
          set_intent: tool({
            description:
              "WAJIB untuk tugas coding sebelum alat pengubah proyek. status 'clear' = boleh dikerjakan; 'need_clarification' = tanya 1-3 hal penting dulu (alat pengubah proyek akan ditolak di giliran ini).",
            inputSchema: z.object({
              status: z.enum(["clear", "need_clarification"]),
              summary: z.string().describe("Ringkasan singkat apa yang akan dibuat / apa yang belum jelas"),
            }),
            execute: async ({ status, summary }) => {
              intent = status;
              setState(status === "clear" ? "PLANNING" : "WAITING_FOR_CLARIFICATION", summary.slice(0, 200));
              return { ok: true, status };
            },
          }),
          milestone: tool({
            description:
              "Perbarui tahap kerja besar berorientasi hasil (3-6 tahap per tugas, mis. 'Analisis kebutuhan', 'Implementasi fitur', 'Pengujian'). status: pending/running/done/failed/attention. Jangan buat tahap per alat.",
            inputSchema: z.object({
              id: z.string().describe("id pendek stabil, mis. 'impl'"),
              title: z.string(),
              status: z.enum(["pending", "running", "done", "failed", "attention"]),
              detail: z.string().optional(),
            }),
            execute: async ({ id: rawId, title: rawTitle, status, detail }) => {
              const id = canonMs(rawId, rawTitle);
              if (!id) return { ok: true, note: "Label teknis bukan tahap; dicatat sebagai aktivitas di tahap berjalan.", milestones: ckpt.milestones };
              const title = MS_TITLES[id]!;
              setMs(id, status, detail ?? (rawTitle !== title ? rawTitle.slice(0, 120) : undefined));
              if (status === "running") {
                if (/tes|test|uji|verif/i.test(title)) setState("TESTING");
                else if (/preview|pratinjau/i.test(title)) setState("PREVIEWING");
                else if (/perbaik|fix/i.test(title)) setState("FIXING");
                else setState("EXECUTING");
              }
              await saveCkpt();
              return { ok: true, milestones: ckpt.milestones };
            },
          }),
           web_search: tool({
             description: `Cari informasi terbaru di internet. Tanggal hari ini ${today} (Makassar). Pakai tahun berjalan untuk info terbaru. Hasil langsung dikembalikan tanpa file.`,
            inputSchema: z.object({ query: z.string().min(1).describe("Kata kunci pencarian yang spesifik") }),
            execute: async ({ query }) => {
              searchCalls += 1;
              if (searchCalls > 3) return { ok: false, query, results: [], detail: "Batas pencarian tercapai. Jawab sekarang dengan info yang sudah ada." };
              try {
                 const results = await webSearch(query);
                 return { ok: true, query, results };
              } catch (err) {
                return { ok: false, query, results: [], error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          read_webpage: tool({
            description: "Ambil dan baca isi teks halaman web dari URL (tanpa menyimpan ke file).",
            inputSchema: z.object({ url: z.string().url() }),
            execute: async ({ url }) => {
              try {
                return await readWebpage(url);
              } catch (err) {
                return { ok: false, url, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          run_command: tool({
            description:
              "Jalankan perintah shell di sandbox Linux. Kembalikan stdout, stderr, dan exit code.",
            inputSchema: z.object({
              command: z.string().describe("Perintah bash yang akan dijalankan"),
            }),
            execute: async ({ command }) => {
              const blocked = checkCommand(command);
              if (blocked) return { ok: false, exitCode: 126, error: blocked };
              const g = gate("run_command");
              if (g) return { ...g, exitCode: 126 };
              const opId = `cmd-${hashOp(command)}`;
              const isInstall = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\bpip3?\s+install\b|\bapt(-get)?\s+install\b/.test(command);
              if (isInstall && doneOp(opId))
                return { exitCode: 0, skipped: true, stdout: "(dilewati: install yang sama sudah berhasil sebelumnya di tugas ini)", stderr: "" };
              const isTest = /\b(g\+\+|gcc|clang|make|cmake|javac|rustc|cargo|go (build|run|test)|tsc|vite build|npm (run )?(build|test)|pytest|python3? .*test|curl)\b/.test(command);
              const changesProject = /(?:^|[;&|]\s*|\s)(?:cat\s+[^|;]*>|tee\s|touch\s|mkdir\s|cp\s|mv\s|sed\s+-i|rm\s)|\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b|\bpip3?\s+install\b/.test(command);
              if (isTest) {
                setState("TESTING", commandDetail(command, "test"));
                if (!ckpt.milestones.find((m) => m.id === "fix" && m.status === "running")) setMs("test", "running");
              } else if (isInstall) {
                setState("EXECUTING", commandDetail(command, "setup"));
                setMs("setup", "running");
              } else if (changesProject) {
                setState("EXECUTING", commandDetail(command, "implement"));
                setMs("implement", "running");
              }
              commandRunning++;
              const finish = async (exitCode: number, stdout: string, stderr: string) => {
                const locations = exitCode !== 0 ? errorLocations(`${stderr}\n${stdout}`) : [];
                if (isTest) ckpt.lastTest = { command: command.slice(0, 300), exitCode, at: Date.now() };
                if (exitCode !== 0) {
                  unresolvedError = true;
                  ckpt.lastError = { message: (stderr || stdout).slice(0, 1500), locations, at: Date.now() };
                  setState("FIXING", locations[0] ? `${locations[0].file}:${locations[0].line}` : undefined);
                  if (isTest) {
                    setMs("test", "failed", "Tes/compile gagal");
                    setMs("fix", "running", locations[0] ? `${locations[0].file}:${locations[0].line}` : undefined);
                  }
                } else if (isTest) {
                  unresolvedError = false;
                  if (ckpt.milestones.find((m) => m.id === "fix")) setMs("fix", "done");
                  setMs("test", "done", "Tes lolos");
                  ckpt.lastError = null;
                }
                await recordOp(opId, "run_command", exitCode === 0, command);
                return locations;
              };
              try {
                const sb = await getSandbox();
                const r = await sb.commands.run(command, {
                  timeoutMs: 120_000,
                  cwd: "/home/user",
                  envs: secretEnvs,
                });
                const locations = await finish(r.exitCode, r.stdout, r.stderr);
                return {
                  exitCode: r.exitCode,
                  stdout: clip(redact(r.stdout)),
                  stderr: clip(redact(r.stderr), 3000),
                  errorLocations: locations.length ? locations : undefined,
                  dirs: await listDirs(sb),
                };
              } catch (err: unknown) {
                const e = err as {
                  exitCode?: number;
                  stdout?: string;
                  stderr?: string;
                  message?: string;
                };
                if (typeof e.exitCode === "number") {
                  const locations = await finish(e.exitCode, e.stdout ?? "", e.stderr ?? "");
                  return {
                    exitCode: e.exitCode,
                    stdout: clip(redact(e.stdout ?? "")),
                    stderr: clip(redact(e.stderr ?? ""), 3000),
                    errorLocations: locations.length ? locations : undefined,
                  };
                }
                await finish(-1, "", e.message ?? String(err));
                return { exitCode: -1, stdout: "", stderr: redact(e.message ?? String(err)) };
              } finally {
                commandRunning--;
              }
            },
          }),
          download_file: tool({
            description:
              "Download file apa pun dari URL: video/audio dari halaman (YouTube, TikTok, Instagram, X, Facebook, Vimeo, Reddit, ribuan situs via yt-dlp), gambar (termasuk gambar postingan via gallery-dl), atau file langsung (PDF, zip, apk, docx, jpg, mp4, dll). Memverifikasi tipe file asli (bukan HTML halaman error) lalu menyimpan di /home/user/downloads (muncul di File Manager).",
            inputSchema: z.object({
              url: z.string().url().describe("URL halaman atau file"),
              kind: z.enum(["auto", "video", "audio", "image", "file"]).optional().describe("Default auto"),
              quality: z.enum(["best", "1080", "720", "480"]).optional().describe("Khusus video, default 720"),
            }),
            execute: async ({ url, kind = "auto", quality }) => {
              try {
                const sb = await getSandbox();
                const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
                const h = quality === "best" ? "" : `[height<=${quality ?? "720"}]`;
                const fmt = kind === "audio" ? "ba/b" : `bv*${h}+ba/b${h}/bv*+ba/b`;
                const media = kind === "auto" || kind === "video" || kind === "audio";
                const ytdlp = `$Y --no-playlist --no-warnings --restrict-filenames --no-part --retries 3 --socket-timeout 30 -f ${q(fmt)} ${kind === "audio" ? "-x --audio-format mp3" : "--merge-output-format mp4 --remux-video mp4"} -o '%(title).70s-%(id)s.%(ext)s' ${q(url)} 2>&1 | tail -n 15`;
                const script = [
                  "D=/home/user/downloads; mkdir -p $D; cd $D",
                  "command -v ffmpeg >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg) >/dev/null 2>&1",
                  "command -v file >/dev/null || (sudo apt-get install -y -qq file) >/dev/null 2>&1",
                  "Y=/home/user/.local/bin/yt-dlp; mkdir -p /home/user/.local/bin",
                  "has(){ find $D -maxdepth 1 -type f -newer $B | grep -q .; }",
                  "B=$(mktemp); touch $B; sleep 1",
                  // 1) file langsung: cek content-type dulu
                  `CT=$(curl -sSIL -A 'Mozilla/5.0' --max-time 20 ${q(url)} | grep -i '^content-type' | tail -1 | tr -d '\\r' | cut -d' ' -f2 | cut -d';' -f1)`,
                  "echo \"content-type: $CT\"",
                  `if [ -n "$CT" ] && ! echo "$CT" | grep -Eqi 'text/html|xhtml'; then NAME=$(basename "$(echo ${q(url)} | cut -d'?' -f1)"); [ -z "$NAME" ] || [ "$NAME" = "/" ] && NAME=file_$(date +%s); curl -sSL -A 'Mozilla/5.0' --max-time 200 -o "$D/$NAME" ${q(url)}; fi`,
                  // 2) media via yt-dlp
                  media ? `if ! has; then if [ ! -x $Y ] || [ -n "$(find $Y -mtime +2 2>/dev/null)" ]; then curl -sSL -o $Y https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux && chmod +x $Y; fi; ${ytdlp}; fi` : "",
                  // 3) gambar/postingan via gallery-dl
                  kind !== "file" ? `if ! has; then (command -v gallery-dl >/dev/null || pip install -q --user gallery-dl >/dev/null 2>&1); PATH=$PATH:/home/user/.local/bin gallery-dl -D $D --range 1-10 ${q(url)} 2>&1 | tail -n 8; fi` : "",
                  // 4) gambar og:image dari halaman HTML
                  kind === "image" || kind === "auto" ? `if ! has; then IMG=$(curl -sSL -A 'Mozilla/5.0' --max-time 20 ${q(url)} | grep -oiE '<meta[^>]+(og:image|twitter:image)[^>]+>' | grep -oiE 'content="[^"]+"' | head -1 | cut -d'"' -f2); [ -n "$IMG" ] && echo "og:image $IMG" && curl -sSL -A 'Mozilla/5.0' --max-time 60 -o "$D/image_$(date +%s).$(echo "$IMG" | cut -d'?' -f1 | grep -oE '(jpe?g|png|webp|gif)$' || echo jpg)" "$IMG"; fi` : "",
                  "echo '---FILES---'",
                  "find $D -maxdepth 1 -type f -newer $B | while read -r f; do M=$(file -b --mime-type \"$f\"); if echo \"$M\" | grep -Eqi 'text/html|xhtml' || [ ! -s \"$f\" ]; then rm -f \"$f\"; echo \"BAD|$f|$M\"; else echo \"OK|$f|$(stat -c %s \"$f\")|$M\"; fi; done",
                  "rm -f $B; exit 0",
                ].filter(Boolean).join("\n");
                const r = await sb.commands.run(script, { timeoutMs: 280_000, cwd: "/home/user", envs: secretEnvs });
                const [log = "", list = ""] = r.stdout.split("---FILES---");
                const files = list.split("\n").filter((l) => l.startsWith("OK|")).map((l) => {
                  const [, path = "", size, mime] = l.split("|");
                  return {
                    path,
                    name: path.split("/").pop(),
                    mime,
                    sizeMB: +(Number(size) / 1048576).toFixed(2),
                    link: `/api/sandbox-download?sandboxId=${encodeURIComponent(sb.sandboxId)}&path=${encodeURIComponent(path)}`,
                  };
                });
                if (!files.length)
                  return {
                    ok: false,
                    url,
                    error: "File tidak bisa diunduh dari URL ini (hasil berupa halaman HTML/kosong sudah dihapus otomatis).",
                    log: clip(redact(log), 2500),
                    saran: "Jangan tulis script/HTML/txt manual. Coba URL yang lebih spesifik (URL file/gambar langsung atau halaman postingan/video), atau jelaskan bahwa situs butuh login/DRM.",
                    dirs: await listDirs(sb),
                  };
                return { ok: true, url, files, dirs: await listDirs(sb) };
              } catch (err) {
                return { ok: false, url, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          write_file: tool({
            description:
              "Tulis file teks ke sandbox (path relatif terhadap /home/user atau absolut).",
            inputSchema: z.object({ path: z.string(), content: z.string() }),
            execute: async ({ path, content }) => {
              try {
                const sb = await getSandbox();
                const p = sandboxPath(path);
                if (typeof p !== "string") return { ok: false, error: p.error };
                if (content.length > 2_000_000) return { ok: false, error: "File terlalu besar (maks 2 MB)." };
                const g = gate("write_file");
                if (g) return g;
                const opId = `write-${hashOp(p + "\0" + content)}`;
                const exists = await sb.files.exists(p).catch(() => false);
                if (exists && !readFiles.has(p) && !doneOp(opId))
                  return { ok: false, path: p, error: "File ini sudah ada dan belum dibaca. Baca dulu dengan read_file sebelum menimpa." };
                const oldText = exists ? await sb.files.read(p).catch(() => "") : "";
                if (oldText === content) {
                  readFiles.add(p);
                  return { ok: true, path: p, bytes: content.length, skipped: true, note: "Isi sama, tidak ditulis ulang." };
                }
                await sb.commands.run(`mkdir -p "$(dirname '${p.replace(/'/g, "'\\''")}')"`, { cwd: "/home/user" }).catch(() => null);
                await sb.files.write(p, content);
                readFiles.add(p);
                if (ckpt.state !== "FIXING") setState("EXECUTING", `Menyimpan ${p.split("/").pop()}`);
                const d = emitFile(p, exists ? "write" : "create", oldText, content, opId);
                await recordOp(opId, "write_file", true, p);
                return { ok: true, path: p, bytes: content.length, changedLines: d.ranges };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          read_file: tool({
            description:
              "Baca isi file teks di sandbox dengan nomor baris. Pakai sebelum mengedit file yang sudah ada. Opsional start/end baris untuk file besar.",
            inputSchema: z.object({
              path: z.string(),
              start: z.number().int().optional(),
              end: z.number().int().optional(),
            }),
            execute: async ({ path, start, end }) => {
              try {
                const sb = await getSandbox();
                const p = sandboxPath(path);
                if (typeof p !== "string") return { ok: false, error: p.error };
                readFiles.add(p);
                const text = await sb.files.read(p);
                const lines = text.split("\n");
                const a = Math.max(1, start ?? 1);
                const b = Math.min(lines.length, end ?? Math.min(lines.length, a + 399));
                const body = lines
                  .slice(a - 1, b)
                  .map((l, i) => `${a + i}: ${l}`)
                  .join("\n");
                return { ok: true, path: p, totalLines: lines.length, from: a, to: b, content: clip(body, 40000) };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          edit_file: tool({
            description:
              "Edit sebagian file yang sudah ada: ganti teks old_text (harus persis sama dan unik di file) dengan new_text. Lebih hemat daripada menulis ulang seluruh file. Baca file dulu dengan read_file.",
            inputSchema: z.object({
              path: z.string(),
              old_text: z.string(),
              new_text: z.string(),
              replace_all: z.boolean().optional(),
            }),
            execute: async ({ path, old_text, new_text, replace_all }) => {
              try {
                const sb = await getSandbox();
                const p = sandboxPath(path);
                if (typeof p !== "string") return { ok: false, error: p.error };
                if (!readFiles.has(p)) return { ok: false, path: p, error: "Baca file ini dulu dengan read_file sebelum mengeditnya." };
                const g = gate("edit_file");
                if (g) return g;
                const text = await sb.files.read(p);
                const count = old_text ? text.split(old_text).length - 1 : 0;
                if (count === 0 && doneOp(`edit-${hashOp(p + "\0" + old_text + "\0" + new_text)}`) && text.includes(new_text))
                  return { ok: true, path: p, skipped: true, note: "Perubahan ini sudah diterapkan sebelumnya." };
                if (count === 0)
                  return { ok: false, path: p, error: "old_text tidak ditemukan. Baca ulang file dengan read_file lalu salin teks persis." };
                if (count > 1 && !replace_all)
                  return { ok: false, path: p, error: `old_text muncul ${count} kali. Tambah konteks agar unik, atau set replace_all.` };
                const next = replace_all ? text.split(old_text).join(new_text) : text.replace(old_text, () => new_text);
                const opId = `edit-${hashOp(p + "\0" + old_text + "\0" + new_text)}`;
                await sb.files.write(p, next);
                const d = emitFile(p, "edit", text, next, opId);
                await recordOp(opId, "edit_file", true, p);
                return { ok: true, path: p, replaced: replace_all ? count : 1, changedLines: d.ranges, content: next.length <= 200_000 ? next : undefined };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          list_files: tool({
            description:
              "Tampilkan struktur folder proyek di sandbox (tanpa node_modules, .git, dist, venv). Pakai untuk memahami proyek sebelum mengubahnya.",
            inputSchema: z.object({ path: z.string().optional(), depth: z.number().int().optional() }),
            execute: async ({ path, depth }) => {
              try {
                const sb = await getSandbox();
                const rp = sandboxPath(path ?? "/home/user");
                if (typeof rp !== "string") return { ok: false, error: rp.error };
                const root = rp.replace(/'/g, "");
                const d = Math.min(Math.max(depth ?? 3, 1), 6);
                const r = await sb.commands.run(
                  `cd '${root}' && find . -maxdepth ${d} \\( -name node_modules -o -name .git -o -name dist -o -name build -o -name .venv -o -name venv -o -name __pycache__ -o -name .next \\) -prune -o -print | sort | head -400`,
                  { timeoutMs: 20_000 },
                );
                return { ok: true, root, tree: clip(r.stdout, 20000) };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          search_code: tool({
            description: "Cari teks/nama fungsi di seluruh proyek sandbox (rekursif, tanpa node_modules/.git). Kembalikan baris dengan nomor baris.",
            inputSchema: z.object({ query: z.string(), path: z.string().optional() }),
            execute: async ({ query, path }) => {
              try {
                const sb = await getSandbox();
                const rp = sandboxPath(path ?? "/home/user");
                if (typeof rp !== "string") return { ok: false, error: rp.error };
                const q = query.replace(/'/g, "'\\''");
                const r = await sb.commands.run(
                  `cd '${rp.replace(/'/g, "")}' && grep -rnI --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build -m 200 '${q}' . | head -200`,
                  { timeoutMs: 30_000 },
                );
                return { ok: true, query, matches: clip(r.stdout, 20000) || "(tidak ada hasil)" };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          todo: tool({
            description: "Tampilkan/perbarui checklist langkah kerja (rencana tugas). Kirim daftar penuh setiap kali; tandai selesai dengan done=true. Wajib dipakai untuk tugas coding multi-langkah.",
            inputSchema: z.object({
              items: z.array(z.object({ text: z.string(), done: z.boolean().optional() })),
            }),
            execute: async ({ items }) => {
              todoState.items = items.map((i) => ({ text: i.text, done: !!i.done }));
              return { ok: true, done: todoState.items.filter((i) => i.done).length, total: todoState.items.length, items: todoState.items };
            },
          }),
          preview_app: tool({
            description:
              "Buat link pratinjau publik (sementara) untuk aplikasi/server yang sedang jalan di sandbox pada port tertentu, seperti preview di Replit/Lovable. Pastikan server sudah jalan dengan --host 0.0.0.0 sebelum dipanggil.",
            inputSchema: z.object({ port: z.number().int() }),
            execute: async ({ port }) => {
              try {
                const sb = await getSandbox();
                const check = await sb.commands
                  .run(`curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:${port}`, { timeoutMs: 10_000 })
                  .catch((e: { stdout?: string }) => ({ stdout: e?.stdout ?? "000" }));
                const g = gate("preview_app");
                if (g) return g;
                setState("PREVIEWING", `port ${port}`);
                const code = String(check.stdout ?? "").trim();
                if (!/^[23]\d\d$/.test(code)) {
                  unresolvedError = true;
                  return { ok: false, port, localStatus: code || "000", error: "Server belum benar-benar berjalan di port ini (health check gagal). Jalankan server di background dengan --host 0.0.0.0, cek log, lalu coba lagi. Jangan beri link pratinjau." };
                }
                const url = `https://${sb.getHost(port)}`;
                await recordOp(`preview-${port}`, "preview_app", true, url);
                return { ok: true, port, url, localStatus: check.stdout, catatan: "Link aktif selama sandbox hidup (~15 menit), bukan deploy permanen." };
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
              }
            },
          }),
          request_secret: tool({
            description:
              "Tampilkan SATU form input aman untuk satu atau beberapa token sekaligus. Panggil sekali saja dengan semua token di array secrets. Nilai tidak pernah terlihat olehmu.",
            inputSchema: z.object({
              secrets: z
                .array(
                  z.object({
                    name: z.string().describe("Nama secret HURUF_BESAR, contoh GITHUB_TOKEN"),
                    service: z
                      .string()
                      .optional()
                      .describe("github, vercel, openai, anthropic, groq, gemini, huggingface, telegram, stripe, netlify, cloudflare, e2b, openrouter, atau lainnya"),
                  }),
                )
                .min(1)
                .max(8),
              reason: z.string().optional().describe("Kalimat singkat untuk apa token dipakai"),
            }),
            execute: async ({ secrets: list }) => ({
              ok: true,
              requested: true,
              names: list.map((s) => s.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")),
              detail:
                "Form sudah tampil. Akhiri responsmu SEKARANG dengan satu kalimat singkat. Jangan uji token. Setelah pengguna klik Terapkan, sistem mengirim hasil pemeriksaan dan kamu melaporkan statusnya.",
            }),
          }),
          list_secrets: tool({
            description: "Lihat daftar secret tersimpan (nama & layanan saja, tanpa nilai).",
            inputSchema: z.object({}),
            execute: async () => ({
              ok: true,
              secrets: secrets.map((s) => ({ name: s.name, service: s.service })),
            }),
          }),
          test_secret: tool({
            description: "Uji apakah secret tersimpan valid dan aktif di layanannya. Tidak menampilkan nilai.",
            inputSchema: z.object({ name: z.string(), service: z.string().optional() }),
            execute: async ({ name, service }) => {
              const found = secrets.find((s) => s.name === name.toUpperCase());
              if (!found) return { ok: false, name, status: "missing", detail: "Secret belum disimpan." };
              const svc = service || found.service;
              const r = await verifySecret(svc, found.value);
              const warn = r.status === "active" ? undefined : formatWarning(svc, found.value);
              return {
                ok: r.status === "active",
                name: found.name,
                service: svc,
                ...r,
                pemilik: r.account,
                ...(warn ? { formatTidakSesuai: warn } : {}),
              };
            },
          }),
        };

        // Mode berpikir adaptif: hanya aktif untuk permintaan yang memang butuh penalaran.
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
        const lastText = String(
          (lastUser?.parts as { type: string; text?: string }[] | undefined)?.find((p) => p.type === "text")?.text ?? "",
        );
        // Cepat: pikir dalam hanya untuk analisis/debug; buat script/chat biasa pakai effort rendah.
        const needsThink =
          lastText.length > 400 ||
          /\b(kenapa|mengapa|analisis|analisa|bandingkan|debug|error|perbaiki|algoritma|strategi|optimasi|why|solve)\b/i.test(lastText);
        const modelMessages = await convertToModelMessages(body.messages);
        // Lampiran gambar/video dikirim ke model sebagai input visual, bukan hanya disalin ke sandbox.
        const visual: { type: "image"; image: string; mediaType: string }[] = [];
        const visualNotes: string[] = [];
        for (const file of attachmentResult.data) {
          if (file.mediaType.startsWith("image/") && !/svg/.test(file.mediaType)) {
            visual.push({ type: "image", image: file.dataUrl, mediaType: file.mediaType });
          } else if (file.mediaType.startsWith("video/")) {
            try {
              const sb = await getSandbox();
              const dir = `/tmp/frames_${Date.now()}`;
              const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
              await sb.commands.run(
                `mkdir -p ${dir} && (command -v ffmpeg >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg) >/dev/null 2>&1) && ` +
                  `D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ${q(file.path)} | cut -d. -f1); D=\${D:-6}; [ "$D" -lt 1 ] && D=1; ` +
                  `ffmpeg -loglevel error -i ${q(file.path)} -vf "fps=6/$D,scale=768:-2" -frames:v 6 ${dir}/f_%02d.jpg`,
                { timeoutMs: 120_000 },
              );
              const list = (await sb.files.list(dir)).map((f) => f.name).filter((n) => n.endsWith(".jpg")).sort();
              for (const name of list) {
                const bytes = await sb.files.read(`${dir}/${name}`, { format: "bytes" });
                visual.push({ type: "image", image: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`, mediaType: "image/jpeg" });
              }
              visualNotes.push(`Video ${file.path} dilampirkan sebagai ${list.length} cuplikan frame berurutan.`);
            } catch {
              visualNotes.push(`Video ${file.path} gagal diambil frame-nya; beri tahu pengguna bila perlu.`);
            }
          }
        }
        const last = modelMessages.at(-1);
        if (last?.role === "user") {
          if (typeof last.content === "string") last.content = [{ type: "text", text: last.content }];
          if (visual.length) last.content.push(...visual);
          if (visualNotes.length) last.content.push({ type: "text", text: visualNotes.join("\n") });
          if (!needsThink) last.content.push({ type: "text", text: "/no_think" });
        }

        const result = streamText({
          model: provider.chatModel(model),
           system: `${SYSTEM_PROMPT}${resumed ? `\n\n[CHECKPOINT TUGAS ${taskId} - LANJUTKAN, JANGAN ULANG DARI AWAL]\nStatus terakhir: ${ckpt.state}. Operasi terakhir yang berhasil: ${ckpt.lastOp ?? "-"}.\nTahap: ${ckpt.milestones.map((m) => `${m.title}=${m.status}`).join(", ") || "-"}.\nFile yang sudah diubah: ${[...new Set(ckpt.files.map((f) => f.path))].join(", ") || "-"}.\nTes terakhir: ${ckpt.lastTest ? `${ckpt.lastTest.command} (exit ${ckpt.lastTest.exitCode})` : "-"}.\nError terakhir: ${ckpt.lastError ? ckpt.lastError.message.slice(0, 500) : "-"}.\nOperasi yang sudah berhasil tidak perlu diulang (server juga akan melewatinya). Lanjutkan dari operasi berikutnya yang belum berhasil. Tahap yang masih running/pending wajib ditutup dengan alat milestone sebelum jawaban akhir. File yang sudah dibuat tetap ada; baca ulang dengan read_file sebelum mengedit.` : ""}\n\nTanggal saat ini (waktu Makassar, UTC+8): ${today}. Untuk permintaan info terbaru, cari dengan tahun berjalan dan cek tanggal sumber sebelum menjawab.`,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(50),
          abortSignal: request.signal,
          // Mode berpikir hanya aktif untuk analisis/debug. Permintaan biasa tanpa reasoning supaya cepat.
          ...(needsThink ? { providerOptions: { openai: { reasoningEffort: "medium" as never } } } : {}),
        });

        const toolStartedAt = new Map<string, number>();
        const inputBuf = new Map<string, string>();
        const inputName = new Map<string, string>();
        const announced = new Set<string>();
        let rawText = "";
        let sentText = "";
        let sentThink = "";
        let sawFakeSecret = false;
        let sentUnderstanding = false;
        let streamFailed = false;
        let finalText = "";
        let calledSecret = false;
        let lastInputBeat = 0;
        let lastThinkBeat = 0;
        const pushText = (final: boolean) => {
          const { think, rest } = splitThink(rawText);
          if (think.length > sentThink.length && think.startsWith(sentThink)) sentThink = think;
          const clean = cleanModelText(rest, final);
          if (clean.length > sentText.length && clean.startsWith(sentText)) {
            emit({ t: "text", v: redact(clean.slice(sentText.length)) });
            sentText = clean;
          }
        };
        const resetStep = () => {
          pushText(true);
          rawText = sentText = sentThink = "";
        };
        const lastUserText = (() => {
          const m = [...(body.messages as { role: string; parts?: { type: string; text?: string }[] }[])]
            .reverse()
            .find((x) => x.role === "user");
          return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text ?? "" : "")).join(" ");
        })();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controllerRef = controller;
            emit({ t: "task", taskId, resumed });
            if (!resumed) emit({ t: "status", state: "RECEIVED", label: "Menerima permintaan" });
            {
              const st = resumed ? ckpt.state : "UNDERSTANDING";
              ckpt.state = "";
              setState(st === "COMPLETED" || st === "FAILED" || st === "ATTENTION" ? "EXECUTING" : st);
            }
            const hb = setInterval(() => emit({ t: "hb" }), 4000);
            try {
              for await (const part of result.fullStream) {
                if (part.type === "text-delta") {
                  rawText += part.text;
                  if (/tool[ _]?request_secret/i.test(rawText)) sawFakeSecret = true;
                  finalText += part.text;
                  pushText(false);
                  // Jawaban hasil mulai ditulis setelah kerja file: tutup tahap implementasi.
                  if (ckpt.files.length && commandRunning === 0 && !unresolvedError &&
                      ckpt.milestones.some((m) => (m.id === "implement" || m.id === "setup") && m.status === "running")) {
                    for (const id of ["setup", "implement"])
                      if (ckpt.milestones.find((m) => m.id === id && m.status === "running")) setMs(id, "done");
                  }
                } else if (part.type === "reasoning-delta") {
                  // Isi pikiran model tidak dikirim ke layar; cukup status singkat.
                  if (needsThink && ckpt.state === "UNDERSTANDING" && !sentUnderstanding) {
                    sentUnderstanding = true;
                    setState("UNDERSTANDING");
                  } else if (needsThink && ["UNDERSTANDING", "PLANNING"].includes(ckpt.state) && Date.now() - lastThinkBeat > 3000) {
                    lastThinkBeat = Date.now();
                    emit({ t: "status", state: ckpt.state, label: "Berpikir", detail: "Berpikir" });
                  }
                } else if (part.type === "finish-step") {
                  resetStep();
                } else if (part.type === "tool-input-delta") {
                  // Status langsung saat model mulai menulis file (tidak menunggu isi file selesai dibuat).
                  const buf = (inputBuf.get(part.id) ?? "") + part.delta;
                  inputBuf.set(part.id, buf);
                  const fp = buf.match(/"path"\s*:\s*"([^"]+)"/)?.[1]?.split("/").pop();
                  const verb = inputName.get(part.id) === "edit_file" ? "Mengubah" : "Menulis";
                  if (fp && !announced.has(part.id)) {
                    announced.add(part.id);
                    lastInputBeat = Date.now();
                    setState("EXECUTING", `${verb} ${fp}`);
                  } else if (fp && Date.now() - lastInputBeat > 1200) {
                    // Kabar berkala selama model menulis isi file, supaya layar tidak terlihat macet.
                    lastInputBeat = Date.now();
                    const lines = buf.split("\\n").length;
                    setState("EXECUTING", `${verb} ${fp} · ${lines} baris`);
                  }
                } else if (part.type === "tool-input-start") {
                  resetStep();
                  inputName.set(part.id, part.toolName);
                  const earlyLabels: Record<string, string> = { write_file: "Menyiapkan file", edit_file: "Menyiapkan perubahan file", run_command: "Menyiapkan perintah", read_file: "Membaca file", list_files: "Melihat struktur file", search_code: "Mencari kode", preview_app: "Menyiapkan pratinjau" };
                  if (earlyLabels[part.toolName]) setState("EXECUTING", earlyLabels[part.toolName]);
                  emit({ t: "tool", id: part.id, name: part.toolName, input: {}, at: Date.now() });
                } else if (part.type === "tool-call") {
                  if (part.toolName === "request_secret") calledSecret = true;
                  if (part.toolName === "write_file" || part.toolName === "edit_file") {
                    const fp = String((part.input as { path?: string })?.path ?? "").split("/").pop();
                    if (fp) setState("EXECUTING", `${part.toolName === "edit_file" ? "Mengubah" : "Menulis"} ${fp}`);
                  }
                  toolStartedAt.set(part.toolCallId, Date.now());
                  emit({
                    t: "tool",
                    id: part.toolCallId,
                    name: part.toolName,
                    input: part.input,
                    at: Date.now(),
                  });
                } else if (part.type === "tool-result") {
                  const at = Date.now();
                  const startedAt = toolStartedAt.get(part.toolCallId) ?? at;
                  emit({
                    t: "result",
                    id: part.toolCallId,
                    output: part.output,
                    at,
                    durationMs: at - startedAt,
                  });
                } else if (part.type === "error") {
                  const reason =
                    part.error instanceof Error ? part.error.message : String(part.error);
                  emit({ t: "error", v: `Tidak bisa menghubungi server AI. ${reason}` });
                  streamFailed = true;
                  cachedUrl = null;
                  break;
                }
              }
              pushText(true);
              // Model menulis request_secret sebagai teks: tampilkan formnya sungguhan.
              if (sawFakeSecret && !calledSecret) {
                const guessed = SECRET_GUESS.filter(([re]) => re.test(lastUserText)).map(([, name, service]) => ({ name, service }));
                const list = guessed.length ? guessed : [{ name: "API_TOKEN", service: "other" }];
                const id = `fake-secret-${Date.now()}`;
                const at = Date.now();
                emit({ t: "tool", id, name: "request_secret", input: { secrets: list }, at });
                emit({ t: "result", id, output: { ok: true, requested: true, names: list.map((x) => x.name) }, at, durationMs: 0 });
                emit({ t: "text", v: "Silakan isi token di form di atas kotak pesan, lalu klik Terapkan." });
              }
            } catch (error) {
              streamFailed = true;
              emit({
                t: "error",
                v: error instanceof Error ? error.message : "Error tidak diketahui",
              });
            } finally {
              clearInterval(hb);
              // Kontrak selesai: hanya ok jika semua syarat terpenuhi.
              const reasons: string[] = [];
              if (streamFailed || request.signal.aborted) reasons.push("Proses terhenti sebelum selesai.");
              if (commandRunning > 0) reasons.push("Masih ada perintah yang berjalan.");
              if (unresolvedError) reasons.push(ckpt.lastError?.locations[0] ? `Error belum teratasi di ${ckpt.lastError.locations[0].file}:${ckpt.lastError.locations[0].line}.` : "Masih ada error yang belum teratasi.");
              const successfulCommand = Object.values(ckpt.ops).some((op) => op.name === "run_command" && op.ok);
              if ((successfulCommand || !Object.values(ckpt.ops).some((op) => op.name === "run_command")) && !unresolvedError && ckpt.files.length > 0 && !streamFailed) {
                for (const id of ["setup", "implement"])
                  if (ckpt.milestones.find((m) => m.id === id && (m.status === "running" || m.status === "pending")))
                    setMs(id, "done");
              }
              const open = ckpt.milestones.filter((m) => m.status === "running" || m.status === "pending");
              const bad = ckpt.milestones.filter((m) => m.status === "failed" || m.status === "attention");
              if (open.length && intent !== "need_clarification") reasons.push(`Tahap belum selesai: ${open.map((m) => m.title).join(", ")}.`);
              if (bad.length) reasons.push(`Tahap perlu perhatian: ${bad.map((m) => m.title).join(", ")}.`);
              if (!cleanModelText(splitThink(finalText).rest, true).trim()) reasons.push("Jawaban akhir belum terbentuk.");
              const waiting = intent === "need_clarification";
              const ok = reasons.length === 0;
              const state = waiting && ok ? "WAITING_FOR_CLARIFICATION" : ok ? "COMPLETED" : streamFailed || request.signal.aborted ? "FAILED" : "ATTENTION";
              ckpt.state = state;
              // Kabari browser dulu, baru simpan checkpoint: jawaban tidak tertahan menunggu sandbox.
              emit({ t: "done", ok, state, reasons });
              if (sandbox) {
                if (ok && !waiting) await sandbox.files.remove(ckptPath).catch(() => null);
                else await saveCkpt();
              }
              if (sandbox) {
                const logPath = `${ckptDir}/events-${taskId}.ndjson`;
                const prev = await sandbox.files.read(logPath).catch(() => "");
                await sandbox.files.write(logPath, (prev ? prev : "") + eventLog.join("\n") + "\n").catch(() => null);
              }
              controllerRef = null;
              try {
                controller.close();
              } catch {
                /* sudah tertutup */
              }
            }
          },
        });

        return new Response(stream, { headers: streamHeaders });
      },
    },
  },
});
