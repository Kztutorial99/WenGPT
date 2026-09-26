import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { Sandbox } from "e2b";
import { verifySecret } from "@/lib/secret-test.server";

const SYSTEM_PROMPT = `Kamu adalah WenGPT, asisten AI yang ramah dan cerdas. Jawab dalam bahasa yang dipakai pengguna (default Bahasa Indonesia).

Kamu bisa ngobrol biasa, menjelaskan, menulis kode, dan menjawab pertanyaan apa pun.
Kamu juga punya sandbox Linux (Ubuntu, Python 3, Node.js, pip, npm tersedia, akses internet) lewat tool:
- run_command: jalankan perintah shell (install package, jalankan script, cek hasil).
- write_file: tulis file ke sandbox. File yang ditulis dengan write_file otomatis muncul di menu File Manager pengguna.

Aturan:
- Pakai tool HANYA jika memang perlu menjalankan/menguji sesuatu atau pengguna memintanya. Untuk obrolan biasa, jawab langsung.
- Sebelum memanggil tool pertama, WAJIB kirim satu kalimat singkat tentang apa yang akan kamu kerjakan. Jangan membuat pengguna menatap layar kosong.
- Setelah tool selesai, jelaskan hasilnya singkat dan jelas.
- Jangan menyatakan pekerjaan berhasil hanya karena perintah selesai. Baca stdout, stderr, dan exit code; jika gagal, cari akar masalah, perbaiki, lalu uji ulang.
- Untuk script atau file yang bisa dijalankan, lakukan pengujian nyata setelah menulis file. Berhenti setelah maksimal 3 percobaan perbaikan dan jelaskan kendalanya jika belum berhasil.
- Jangan tampilkan JSON tool mentah atau menuliskan format pemanggilan tool sebagai teks.
- Tulis jawaban yang rapi dan mudah dipindai. Gunakan Markdown secara wajar: judul pendek hanya saat membantu, paragraf ringkas, daftar untuk langkah atau pilihan, dan blok kode dengan nama bahasa.
- Jangan menumpuk judul, mengulang kesimpulan, atau memakai tanda baca berlebihan. Jangan mengarang hasil tool.
- Untuk Bahasa Indonesia, gunakan ejaan dan tanda baca yang natural. Sesuaikan tingkat teknis dengan cara pengguna berbicara.
- Jika pengguna minta dibuatkan file (script, dokumen, config, dll), SELALU buat dengan write_file (bukan echo/cat >), lalu sebutkan bahwa file bisa dilihat di File Manager.
- Git: jika pengguna hanya bilang "cek git" / "git ada?", cukup jalankan \`git --version\`. Jangan jalankan git status/init/clone/push kecuali pengguna memintanya secara eksplisit.
- Cek tool/bahasa (python, node, git, dll) = cek versi terinstal, bukan status proyek.
- Menulis script: tulis kode lengkap dengan indentasi konsisten 4 spasi (tanpa tab), tanpa karakter non-ASCII pada kode/identifier, dan jangan tinggalkan placeholder.
- Script Python: setelah write_file, jalankan dulu \`python3 -m py_compile <file>\` sebelum menjalankannya. Untuk script interaktif, uji dengan input lewat pipe dan pastikan menangani EOF (try/except EOFError).
- Jika error, BACA pesan error baris per baris, perbaiki akar masalahnya dengan menulis ulang file utuh lewat write_file, lalu uji ulang. Jangan umumkan hasil ke pengguna sebelum uji terakhir berhasil.
- File dari sesi lain milik pengguna otomatis tersedia di sandbox (File Manager dipakai bersama semua sesi).
- Lampiran pengguna berada di folder /home/user/attached_assets. Sebutkan nama, tipe, dan ukuran file sebelum menganalisis. Untuk file besar, lihat bagian yang relevan saja dengan tool shell dan jangan menampilkan seluruh isi.
- Secret/token pengguna: jika pengguna minta menyimpan/load token, API key, atau secret, panggil request_secret SATU KALI dengan semua token yang diminta di array secrets (nama HURUF_BESAR, mis. GITHUB_TOKEN) supaya muncul satu form input aman. Setelah itu langsung akhiri respons dengan satu kalimat singkat dan tunggu. JANGAN pernah minta pengguna menempel token di chat. Setelah pengguna klik Terapkan, aplikasi sendiri yang mengecek dan menampilkan status token di bawah jawabanmu; jadi cukup tulis satu kalimat seperti "Isi token di form di atas kotak pesan lalu klik Terapkan, nanti langsung aku cek." Jangan bilang token sudah tersimpan.
- Jangan pernah menulis ringkasan tool seperti "(Perintah ...)" atau "(Tool ...)" di jawabanmu.
- Saat melaporkan hasil uji token: sebutkan status (aktif/tidak), layanan, dan pemilik/akun yang terhubung (field account/pemilik). JANGAN sebut panjang token atau karakter token. Hanya jika ada field formatTidakSesuai, jelaskan bahwa format/panjang token tidak sesuai standar layanan.
- JANGAN menulis isi pikiran, tag [thinking], atau "tool nama_tool:" sebagai teks. Panggil tool lewat mekanisme tool saja.
- Untuk melihat secret yang tersimpan pakai list_secrets; untuk menguji apakah token benar dan aktif pakai test_secret. Nilai secret tidak pernah terlihat olehmu dan jangan pernah mencoba menampilkannya.
- Secret tersedia sebagai environment variable di run_command (mis. $GITHUB_TOKEN). Jangan echo/print nilainya.
- Folder kerja: /home/user. Jangan jalankan perintah yang berjalan selamanya (server) tanpa '&' di belakang.`;


// Model kadang menulis pemanggilan tool sebagai teks biasa. Saring sebelum dikirim ke layar.
const FAKE_TOOL_LINE = /^[ \t>*_`]*tool[ _]?(request_secret|list_secrets|test_secret|run_command|write_file|read_file)\b.*$/gim;
function cleanModelText(raw: string, final: boolean) {
  const t = raw;
  const lastNl = t.lastIndexOf("\n");
  let body = final ? t : t.slice(0, lastNl + 1);
  let tail = final ? "" : t.slice(lastNl + 1);
  body = body.replace(FAKE_TOOL_LINE, "");
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

const clip = (s: string, n = 6000) =>
  s.length > n ? s.slice(0, n) + `\n...[dipotong ${s.length - n} karakter]` : s;

type Ev =
  | { t: "text"; v: string }
  | { t: "think"; v: string }
  | { t: "sandbox"; id: string }
  | { t: "sandbox_reset" }
  | { t: "tool"; id: string; name: string; input: unknown; at: number }
  | { t: "result"; id: string; output: unknown; at: number; durationMs: number }
  | { t: "error"; v: string };

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
        const provider = createOpenAI({ apiKey, baseURL });
        const model = process.env["AI_MODEL"] || "gpt-4o-mini";

        const encoder = new TextEncoder();
        let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
        const emit = (e: Ev) => controllerRef?.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

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

        const tools = {
          run_command: tool({
            description:
              "Jalankan perintah shell di sandbox Linux. Kembalikan stdout, stderr, dan exit code.",
            inputSchema: z.object({
              command: z.string().describe("Perintah bash yang akan dijalankan"),
            }),
            execute: async ({ command }) => {
              try {
                const sb = await getSandbox();
                const r = await sb.commands.run(command, {
                  timeoutMs: 120_000,
                  cwd: "/home/user",
                  envs: secretEnvs,
                });
                return {
                  exitCode: r.exitCode,
                  stdout: clip(redact(r.stdout)),
                  stderr: clip(redact(r.stderr), 3000),
                  dirs: await listDirs(sb),
                };
              } catch (err: unknown) {
                const e = err as {
                  exitCode?: number;
                  stdout?: string;
                  stderr?: string;
                  message?: string;
                };
                if (typeof e.exitCode === "number")
                  return {
                    exitCode: e.exitCode,
                    stdout: clip(redact(e.stdout ?? "")),
                    stderr: clip(redact(e.stderr ?? ""), 3000),
                  };
                return { exitCode: -1, stdout: "", stderr: redact(e.message ?? String(err)) };
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
                const p = path.startsWith("/") ? path : `/home/user/${path}`;
                await sb.files.write(p, content);
                return { ok: true, path: p, bytes: content.length };
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
        const needsThink =
          lastText.length > 160 ||
          /\b(kenapa|mengapa|jelaskan|analisis|analisa|bandingkan|hitung|debug|error|fix|perbaiki|buat(kan)?|script|kode|code|algoritma|rencana|strategi|optimasi|install|jalankan|why|explain|solve|build|plan)\b/i.test(
            lastText,
          );
        const modelMessages = await convertToModelMessages(body.messages);
        if (!needsThink) {
          const last = modelMessages.at(-1);
          if (last?.role === "user") {
            if (typeof last.content === "string") last.content += " /no_think";
            else last.content.push({ type: "text", text: "/no_think" });
          }
        }

        const result = streamText({
          model: provider.chat(model),
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(24),
          abortSignal: request.signal,
          providerOptions: { openai: { reasoningEffort: (needsThink ? "medium" : "low") as never } },
        });

        const toolStartedAt = new Map<string, number>();
        let rawText = "";
        let sentText = "";
        let sentThink = "";
        let sawFakeSecret = false;
        let calledSecret = false;
        const pushText = (final: boolean) => {
          const { think, rest } = splitThink(rawText);
          if (think.length > sentThink.length && think.startsWith(sentThink)) {
            emit({ t: "think", v: redact(think.slice(sentThink.length)) });
            sentThink = think;
          }
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
            try {
              for await (const part of result.fullStream) {
                if (part.type === "text-delta") {
                  rawText += part.text;
                  if (/tool[ _]?request_secret/i.test(rawText)) sawFakeSecret = true;
                  pushText(false);
                } else if (part.type === "reasoning-delta") {
                  const v = String(part.text ?? "");
                  if (v) emit({ t: "think", v: redact(v) });
                } else if (part.type === "finish-step") {
                  resetStep();
                } else if (part.type === "tool-input-start") {
                  resetStep();
                  emit({ t: "tool", id: part.id, name: part.toolName, input: {}, at: Date.now() });
                } else if (part.type === "tool-call") {
                  if (part.toolName === "request_secret") calledSecret = true;
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
              emit({
                t: "error",
                v: error instanceof Error ? error.message : "Error tidak diketahui",
              });
            } finally {
              controllerRef = null;
              controller.close();
            }
          },
        });

        return new Response(stream, { headers: streamHeaders });
      },
    },
  },
});
