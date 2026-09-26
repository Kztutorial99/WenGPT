import { loadSecrets, secretPayload } from "./secret-store";
export type ToolOut = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  ok?: boolean;
  error?: string;
  path?: string;
  bytes?: number;
  status?: string;
  account?: string;
  detail?: string;
  requested?: boolean;
  name?: string;
  service?: string;
};
export type ToolRun = {
  id: string;
  name: string;
  input: {
    command?: string;
    path?: string;
    content?: string;
    name?: string;
    service?: string;
    reason?: string;
    secrets?: { name: string; service?: string }[];
  };
  output?: ToolOut;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
};
export type Part =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; run: ToolRun };
export type MessageData = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  createdAt: number;
};
export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sandboxId: string | null;
  messages: MessageData[];
};
export type Checkpoint = { id: string; ask: string; startedAt: number; runs: ToolRun[] };
export type SavedFile = {
  path: string;
  content: string;
  runId: string;
  ask: string;
  failed: boolean;
  updatedAt: number;
  sessionId?: string;
  sessionTitle?: string;
  attachmentId?: string;
  mediaType?: string;
  size?: number;
  truncated?: boolean;
  key?: string;
};
type ReadState = { files: number; history: number; timelines: Record<string, number> };
/** Perubahan path/penghapusan yang menimpa file hasil eksekusi maupun lampiran. */
export type FileOp = { path?: string; removed?: boolean };
type State = {
  ready: boolean;
  sessions: ChatSession[];
  activeId: string | null;
  streamingIds: string[];
  attachments: SavedFile[];
  fileOps: Record<string, FileOp>;
  folders: string[];
  read: ReadState;
};

const STORE = "wengpt:sessions:v2";
const LEGACY = "wengpt:chat";
const EMPTY_READ: ReadState = { files: 0, history: 0, timelines: {} };
let state: State = {
  ready: false,
  sessions: [],
  activeId: null,
  streamingIds: [],
  attachments: [],
  fileOps: {},
  folders: [],
  read: EMPTY_READ,
};
const serverState: State = {
  ready: false,
  sessions: [],
  activeId: null,
  streamingIds: [],
  attachments: [],
  fileOps: {},
  folders: [],
  read: EMPTY_READ,
};
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();

function emit() {
  listeners.forEach((listener) => listener());
}
function save() {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORE,
    JSON.stringify({
      sessions: state.sessions,
      activeId: state.activeId,
      attachments: state.attachments,
      fileOps: state.fileOps,
      folders: state.folders,
      read: state.read,
    }),
  );
}
function updateSessions(updater: (sessions: ChatSession[]) => ChatSession[]) {
  state = { ...state, sessions: updater(state.sessions) };
  save();
  emit();
}
function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Chat baru",
    createdAt: now,
    updatedAt: now,
    sandboxId: null,
    messages: [],
  };
}

export function bootChatStore() {
  if (state.ready || typeof window === "undefined") return;
  let sessions: ChatSession[] = [];
  let activeId: string | null = null;
  let attachments: SavedFile[] = [];
  let fileOps: Record<string, FileOp> = {};
  let folders: string[] = [];
  let read: ReadState = EMPTY_READ;
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || "null") as {
      sessions?: ChatSession[];
      activeId?: string;
      attachments?: SavedFile[];
      fileOps?: Record<string, FileOp>;
      folders?: string[];
      read?: Partial<ReadState>;
    } | null;
    if (Array.isArray(stored?.sessions)) sessions = stored.sessions;
    if (typeof stored?.activeId === "string") activeId = stored.activeId;
    if (Array.isArray(stored?.attachments)) attachments = stored.attachments;
    if (stored?.fileOps && typeof stored.fileOps === "object") fileOps = stored.fileOps;
    if (Array.isArray(stored?.folders)) folders = stored.folders.filter((f) => typeof f === "string");
    if (stored?.read)
      read = {
        files: stored.read.files ?? 0,
        history: stored.read.history ?? 0,
        timelines: stored.read.timelines ?? {},
      };
  } catch {
    localStorage.removeItem(STORE);
  }
  if (sessions.length === 0) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY) || "null") as {
        messages?: MessageData[];
        sandboxId?: string;
      } | null;
      if (Array.isArray(legacy?.messages) && legacy.messages.length) {
        const now = Date.now();
        sessions = [
          {
            id: crypto.randomUUID(),
            title: titleFrom(legacy.messages),
            createdAt: now,
            updatedAt: now,
            sandboxId: legacy.sandboxId ?? null,
            messages: legacy.messages.map((m) => ({ ...m, createdAt: m.createdAt ?? now })),
          },
        ];
      }
    } catch {
      localStorage.removeItem(LEGACY);
    }
  }
  if (sessions.length === 0) sessions = [newSession()];
  if (!activeId || !sessions.some((s) => s.id === activeId)) activeId = sessions[0]?.id ?? null;
  state = { ...state, ready: true, sessions, activeId, attachments, fileOps, folders, read };
  save();
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSnapshot() {
  return state;
}
export function getServerSnapshot(): State {
  return serverState;
}
export function getSession(id: string) {
  return state.sessions.find((session) => session.id === id);
}
export function setActiveSession(id: string) {
  if (state.activeId !== id) {
    state = { ...state, activeId: id };
    save();
    emit();
  }
}
export function markFilesRead() {
  state = { ...state, read: { ...state.read, files: Date.now() } };
  save();
  emit();
}
export function markTimelineRead(id: string) {
  state = {
    ...state,
    read: { ...state.read, timelines: { ...state.read.timelines, [id]: Date.now() } },
  };
  save();
  emit();
}
export function markHistoryRead() {
  state = { ...state, read: { ...state.read, history: Date.now() } };
  save();
  emit();
}
export function createSession() {
  const session = newSession();
  state = { ...state, sessions: [session, ...state.sessions], activeId: session.id };
  save();
  emit();
  return session.id;
}
export function deleteSession(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  const attachmentIds = state.attachments
    .filter((file) => file.sessionId === id)
    .flatMap((file) => (file.attachmentId ? [file.attachmentId] : []));
  if (attachmentIds.length)
    void import("./attachment-store").then(({ removeAttachments }) =>
      removeAttachments(attachmentIds),
    );
  let sessions = state.sessions.filter((session) => session.id !== id);
  if (!sessions.length) sessions = [newSession()];
  const activeId = state.activeId === id ? (sessions[0]?.id ?? null) : state.activeId;
  state = {
    ...state,
    sessions,
    activeId,
    attachments: state.attachments.filter((file) => file.sessionId !== id),
    streamingIds: state.streamingIds.filter((value) => value !== id),
  };
  save();
  emit();
  return activeId;
}
export function stopSession(id: string) {
  controllers.get(id)?.abort();
}
export function isStreaming(id: string) {
  return state.streamingIds.includes(id);
}

function titleFrom(messages: MessageData[]) {
  const first = messages.find((m) => m.role === "user")?.parts.find((p) => p.type === "text");
  const text = first?.type === "text" ? first.text.trim().replace(/\s+/g, " ") : "Chat baru";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text || "Chat baru";
}
function summarizeTool(part: Extract<Part, { type: "tool" }>) {
  const { name, input, output } = part.run;
  if (name === "write_file")
    return output?.ok === false
      ? `[tool write_file gagal: ${input.path}]`
      : `[tool write_file: ${input.path}]`;
  if (name === "run_command") {
    const result = output
      ? `exit ${output.exitCode ?? "?"}\n${(output.stdout || output.stderr || "").slice(0, 500)}`
      : "belum selesai";
    return `[tool run_command: ${String(input.command ?? "").slice(0, 250)} → ${result}]`;
  }
  return `[tool ${name} selesai]`;
}
function messageText(message: MessageData) {
  return message.parts
    .map((part) =>
      part.type === "text" ? part.text : part.type === "think" ? "" : `\n${summarizeTool(part)}\n`,
    )
    .join("");
}
function patchSession(id: string, updater: (session: ChatSession) => ChatSession) {
  updateSessions((sessions) =>
    sessions.map((session) => (session.id === id ? updater(session) : session)),
  );
}
function patchAssistant(
  sessionId: string,
  assistantId: string,
  updater: (parts: Part[]) => Part[],
) {
  patchSession(sessionId, (session) => ({
    ...session,
    updatedAt: Date.now(),
    messages: session.messages.map((message) =>
      message.id === assistantId ? { ...message, parts: updater(message.parts) } : message,
    ),
  }));
}

type PendingAttachment = { filename?: string; mediaType?: string; url: string };
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const PREVIEW_CHARS = 16_000;
function safeFileName(value: string) {
  return (
    value
      .replaceAll("\\", "/")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 160) || "file"
  );
}
function isTextFile(type: string, filename: string) {
  return (
    type.startsWith("text/") ||
    /\.(?:txt|md|csv|json|ya?ml|toml|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|c|cpp|h|hpp|sh|sql|log)$/i.test(
      filename,
    )
  );
}

async function persistAttachments(session: ChatSession, incoming: PendingAttachment[]) {
  if (!incoming.length) return [];
  const { saveAttachment } = await import("./attachment-store");
  const saved: SavedFile[] = [];
  for (const item of incoming.slice(0, 10)) {
    const response = await fetch(item.url);
    const blob = await response.blob();
    if (blob.size > MAX_ATTACHMENT_BYTES)
      throw new Error(`${item.filename ?? "File"} melebihi batas 20 MB.`);
    const filename = safeFileName(item.filename ?? "file");
    const id = crypto.randomUUID();
    const mediaType = item.mediaType || blob.type || "application/octet-stream";
    const fullText = isTextFile(mediaType, filename) ? await blob.text() : "";
    await saveAttachment(id, blob);
    saved.push({
      path: `/home/user/attached_assets/${filename}`,
      content: fullText.slice(0, PREVIEW_CHARS),
      runId: `attachment:${id}`,
      ask: "Lampiran pengguna",
      failed: false,
      updatedAt: Date.now(),
      sessionId: session.id,
      sessionTitle: session.title,
      attachmentId: id,
      mediaType,
      size: blob.size,
      truncated: fullText.length > PREVIEW_CHARS,
    });
  }
  state = { ...state, attachments: [...saved, ...state.attachments] };
  save();
  emit();
  return saved;
}

async function attachmentPayload(files: SavedFile[]) {
  const { blobToDataUrl, loadAttachment } = await import("./attachment-store");
  const result: { path: string; mediaType: string; size: number; dataUrl: string }[] = [];
  for (const file of files) {
    if (!file.attachmentId) continue;
    const blob = await loadAttachment(file.attachmentId);
    if (blob)
      result.push({
        path: file.path,
        mediaType: file.mediaType ?? blob.type,
        size: file.size ?? blob.size,
        dataUrl: await blobToDataUrl(blob),
      });
  }
  return result;
}

export async function sendMessage(
  sessionId: string,
  raw: string,
  incoming: PendingAttachment[] = [],
) {
  const prompt = raw.trim();
  const session = getSession(sessionId);
  if ((!prompt && !incoming.length) || !session || isStreaming(sessionId)) return;
  await loadSecrets();
  const newlyAttached = await persistAttachments(session, incoming);
  const attachmentNote = newlyAttached.length
    ? `\n\n[Lampiran pengguna]\n${newlyAttached.map((file) => `- ${file.path.replace("/home/user/", "")} (${file.mediaType}, ${file.size} byte)${file.content ? `\n  Cuplikan isi:\n${file.content}` : "\n  File biner tersedia di sandbox untuk diperiksa dengan tool."}`).join("\n")}`
    : "";
  const visiblePrompt =
    prompt || `Analisis ${newlyAttached.length === 1 ? "file ini" : "file-file ini"}.`;
  const now = Date.now();
  const user: MessageData = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: visiblePrompt }],
    createdAt: now,
  };
  const assistant: MessageData = {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [],
    createdAt: now + 1,
  };
  const history = [...session.messages, user];
  patchSession(sessionId, (current) => ({
    ...current,
    title: current.messages.length ? current.title : titleFrom([user]),
    updatedAt: now,
    messages: [...history, assistant],
  }));
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  state = { ...state, streamingIds: [...state.streamingIds, sessionId] };
  emit();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        sessionId,
        sandboxId: session.sandboxId,
        files: loadAllFiles()
          .filter((file) => !file.failed && !file.attachmentId && !file.truncated)
          .slice(0, 40)
          .map(({ path, content }) => ({ path, content })),
        secrets: secretPayload(),
        attachments: await attachmentPayload(state.attachments.filter((f) => f.attachmentId).slice(0, 10)),
        messages: history.slice(-16).map((message) => ({
          id: message.id,
          role: message.role,
          parts: [
            {
              type: "text",
              text:
                message.id === user.id
                  ? messageText(message) + attachmentNote
                  : messageText(message),
            },
          ],
        })),
      }),
    });
    if (!response.ok || !response.body)
      throw new Error((await response.text()) || "WenGPT tidak merespons.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { t: string; [key: string]: unknown };
        if (event.t === "text" || event.t === "error") {
          const valueText =
            event.t === "error" ? `\n\n**${String(event["v"])}**` : String(event["v"] ?? "");
          patchAssistant(sessionId, assistant.id, (parts) => {
            const last = parts.at(-1);
            return last?.type === "text"
              ? [...parts.slice(0, -1), { type: "text", text: last.text + valueText }]
              : [...parts, { type: "text", text: valueText }];
          });
        } else if (event.t === "think") {
          const valueText = String(event["v"] ?? "");
          patchAssistant(sessionId, assistant.id, (parts) => {
            const last = parts.at(-1);
            return last?.type === "think"
              ? [...parts.slice(0, -1), { type: "think", text: last.text + valueText }]
              : [...parts, { type: "think", text: valueText }];
          });
        } else if (event.t === "sandbox") {
          patchSession(sessionId, (current) => ({ ...current, sandboxId: String(event["id"]) }));
        } else if (event.t === "sandbox_reset") {
          patchAssistant(sessionId, assistant.id, (parts) => [
            ...parts,
            {
              type: "text",
              text: "\n\n> Sandbox sesi sebelumnya sudah berakhir. Saya membuat lingkungan baru; paket sementara perlu dipasang ulang.\n\n",
            },
          ]);
        } else if (event.t === "tool") {
          const id = String(event["id"]);
          const input = (event["input"] ?? {}) as ToolRun["input"];
          patchAssistant(sessionId, assistant.id, (parts) =>
            parts.some((part) => part.type === "tool" && part.run.id === id)
              ? parts.map((part) =>
                  part.type === "tool" && part.run.id === id
                    ? {
                        type: "tool",
                        run: {
                          ...part.run,
                          input,
                          startedAt: Number(event["at"]) || part.run.startedAt,
                        },
                      }
                    : part,
                )
              : [
                  ...parts,
                  {
                    type: "tool",
                    run: {
                      id,
                      name: String(event["name"]),
                      input,
                      startedAt: Number(event["at"]) || Date.now(),
                    },
                  },
                ],
          );
        } else if (event.t === "result") {
          const dirs = (event["output"] as { dirs?: unknown } | undefined)?.dirs;
          if (Array.isArray(dirs)) addFolders(dirs.filter((d): d is string => typeof d === "string"));
          if (dirs) void syncSandboxFiles(sessionId);
          patchAssistant(sessionId, assistant.id, (parts) =>
            parts.map((part) =>
              part.type === "tool" && part.run.id === event["id"]
                ? {
                    type: "tool",
                    run: {
                      ...part.run,
                      output: event["output"] as ToolOut,
                      finishedAt: Number(event["at"]) || Date.now(),
                      ...(Number(event["durationMs"])
                        ? { durationMs: Number(event["durationMs"]) }
                        : {}),
                    },
                  }
                : part,
            ),
          );
        }
      }
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError")
      patchAssistant(sessionId, assistant.id, (parts) => [
        ...parts,
        { type: "text", text: `\n\n**${(error as Error).message}**` },
      ]);
  } finally {
    controllers.delete(sessionId);
    state = { ...state, streamingIds: state.streamingIds.filter((id) => id !== sessionId) };
    save();
    emit();
  }
}

export function loadCheckpoints(sessionId: string): Checkpoint[] {
  const list: Checkpoint[] = [];
  let current: Checkpoint | null = null;
  for (const message of getSession(sessionId)?.messages ?? []) {
    if (message.role === "user") {
      const part = message.parts.find((p) => p.type === "text");
      current = {
        id: message.id,
        ask: part?.type === "text" ? part.text : "",
        startedAt: message.createdAt,
        runs: [],
      };
      list.push(current);
      continue;
    }
    for (const part of message.parts)
      if (part.type === "tool" && current) current.runs.push(part.run);
  }
  return list.filter((checkpoint) => checkpoint.runs.length);
}
export function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/home/user/${path}`;
}
export function loadFiles(sessionId: string): SavedFile[] {
  const map = new Map<string, SavedFile>();
  for (const checkpoint of loadCheckpoints(sessionId))
    for (const run of checkpoint.runs) {
      if (run.name !== "write_file" || !run.input.path) continue;
      const path = normalizePath(run.input.path);
      map.delete(path);
      map.set(path, {
        path,
        content: String(run.input.content ?? ""),
        runId: run.id,
        ask: checkpoint.ask,
        failed: run.output?.ok === false,
        updatedAt: run.finishedAt ?? run.startedAt,
      });
    }
  return [...map.values()].reverse();
}
const SANDBOX_ROOT = "/home/user";
const NAME_MAX = 120;
const baseName = (path: string) => path.split("/").pop() || path;
const parentPath = (path: string) => path.split("/").slice(0, -1).join("/") || SANDBOX_ROOT;

function keyOf(file: SavedFile) {
  return file.key ?? file.path;
}
function applyOp(key: string, file: SavedFile): SavedFile | null {
  const op = state.fileOps[key];
  if (op?.removed) return null;
  return { ...file, key, path: op?.path ?? file.path };
}
function writeOps(next: Record<string, FileOp>) {
  state = { ...state, fileOps: next };
  save();
  emit();
}

export function loadAllFiles(): SavedFile[] {
  const map = new Map<string, SavedFile>();
  const add = (key: string, file: SavedFile) => {
    const applied = applyOp(key, file);
    if (!applied) return;
    const prev = map.get(applied.path);
    if (!prev || prev.updatedAt < applied.updatedAt) map.set(applied.path, applied);
  };
  for (const file of state.attachments) add(keyOf(file), file);
  for (const session of state.sessions)
    for (const file of loadFiles(session.id))
      add(`${session.id}:${file.runId}`, {
        ...file,
        sessionId: session.id,
        sessionTitle: session.title,
      });
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ---------- aksi File Manager ---------- */

export function isValidName(value: string) {
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.length > NAME_MAX) return false;
  if (trimmed === "." || trimmed === "..") return false;
  return !/[/\\\u0000-\u001f]/.test(trimmed);
}
export function fileExists(path: string) {
  return loadAllFiles().some((file) => file.path === path);
}
export function folderExists(path: string) {
  return (
    state.folders.some((f) => f === path || f.startsWith(`${path}/`)) ||
    loadAllFiles().some((file) => file.path.startsWith(`${path}/`))
  );
}
export function listFolders() {
  return state.folders;
}
export function addFolders(paths: string[]) {
  const next = new Set(state.folders);
  let changed = false;
  for (const raw of paths) {
    const path = raw.replace(/\/+$/, "");
    if (!path.startsWith(`${SANDBOX_ROOT}/`) || /\/\./.test(path) || next.has(path)) continue;
    next.add(path);
    changed = true;
  }
  if (!changed) return;
  state = { ...state, folders: [...next].sort() };
  save();
  emit();
}
function dropFolders(prefix: string, replaceWith?: string) {
  const next = state.folders.flatMap((f) =>
    f === prefix || f.startsWith(`${prefix}/`)
      ? replaceWith
        ? [`${replaceWith}${f.slice(prefix.length)}`]
        : []
      : [f],
  );
  state = { ...state, folders: [...new Set(next)].sort() };
}
export function createFolder(dir: string, folderName: string) {
  const wanted = folderName.trim();
  if (!isValidName(wanted)) throw new Error("Nama folder tidak valid.");
  const path = `${dir}/${wanted}`;
  if (folderExists(path)) throw new Error(`Folder “${wanted}” sudah ada.`);
  addFolders([path]);
  return path;
}
export function createTextFile(dir: string, fileName: string, content = "") {
  const wanted = fileName.trim();
  if (!isValidName(wanted)) throw new Error("Nama file tidak valid.");
  const path = `${dir}/${wanted}`;
  if (fileExists(path)) throw new Error(`“${wanted}” sudah ada di folder ini.`);
  const file: SavedFile = {
    path,
    content,
    runId: "manual",
    ask: "Dibuat di File Manager",
    failed: false,
    updatedAt: Date.now(),
    mediaType: "text/plain",
    size: content.length,
    key: crypto.randomUUID(),
  };
  state = { ...state, attachments: [file, ...state.attachments] };
  save();
  emit();
  return file;
}
export function setSessionSandbox(sessionId: string, sandboxId: string) {
  patchSession(sessionId, (current) => ({ ...current, sandboxId }));
}
export function folderPaths(): string[] {
  const seen = new Set<string>(state.folders);
  for (const file of loadAllFiles()) {
    let dir = parentPath(file.path);
    while (dir.startsWith(`${SANDBOX_ROOT}/`)) {
      seen.add(dir);
      dir = parentPath(dir);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
export function countUnder(prefix: string) {
  return loadAllFiles().filter((file) => file.path.startsWith(`${prefix}/`)).length;
}
function fileByKey(key: string) {
  return loadAllFiles().find((file) => file.key === key);
}
function copyNameIn(dir: string, base: string) {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 1; i < 60; i += 1) {
    const candidate = `${stem}${i === 1 ? "-salinan" : `-salinan-${i}`}${ext}`;
    if (!fileExists(`${dir}/${candidate}`)) return candidate;
  }
  return `${stem}-salinan-${Date.now()}${ext}`;
}

export function removeFile(key: string) {
  if (!fileByKey(key)) return 0;
  writeOps({ ...state.fileOps, [key]: { removed: true } });
  return 1;
}

export function removeFolder(prefix: string) {
  const targets = loadAllFiles().filter((file) => file.path.startsWith(`${prefix}/`));
  const next = { ...state.fileOps };
  for (const file of targets) next[file.key ?? file.path] = { removed: true };
  dropFolders(prefix);
  writeOps(next);
  return targets.length;
}

export function renameFile(key: string, newName: string) {
  const file = fileByKey(key);
  if (!file) throw new Error("File tidak ditemukan.");
  const wanted = newName.trim();
  if (!isValidName(wanted)) throw new Error("Nama tidak boleh kosong atau memakai tanda /.");
  const path = `${parentPath(file.path)}/${wanted}`;
  if (path === file.path) return file;
  if (fileExists(path)) throw new Error(`“${wanted}” sudah ada di folder ini.`);
  writeOps({ ...state.fileOps, [key]: { path } });
  return { ...file, path };
}

export function moveFile(key: string, dir: string) {
  const file = fileByKey(key);
  if (!file) throw new Error("File tidak ditemukan.");
  const path = `${dir}/${baseName(file.path)}`;
  if (path === file.path) return file;
  if (fileExists(path)) throw new Error(`“${baseName(file.path)}” sudah ada di folder itu.`);
  writeOps({ ...state.fileOps, [key]: { path } });
  return { ...file, path };
}

function relocateFolder(prefix: string, target: string) {
  if (!isValidName(baseName(target))) throw new Error("Nama folder tidak valid.");
  if (target === prefix) return countUnder(prefix);
  if (target.startsWith(`${prefix}/`))
    throw new Error("Folder tidak bisa dipindahkan ke dalam dirinya sendiri.");
  if (folderExists(target)) throw new Error(`“${baseName(target)}” sudah berisi file.`);
  const next = { ...state.fileOps };
  let moved = 0;
  for (const file of loadAllFiles()) {
    if (!file.path.startsWith(`${prefix}/`)) continue;
    next[file.key ?? file.path] = { path: `${target}/${file.path.slice(prefix.length + 1)}` };
    moved += 1;
  }
  dropFolders(prefix, target);
  writeOps(next);
  return moved;
}
export function renameFolder(prefix: string, newName: string) {
  return relocateFolder(prefix, `${parentPath(prefix)}/${newName.trim()}`);
}
export function moveFolder(prefix: string, dir: string) {
  return relocateFolder(prefix, `${dir}/${baseName(prefix)}`);
}

export async function duplicateFile(key: string, targetName?: string) {
  const file = fileByKey(key);
  if (!file) throw new Error("File tidak ditemukan.");
  const dir = parentPath(file.path);
  const wanted = (targetName ?? copyNameIn(dir, baseName(file.path))).trim();
  if (!isValidName(wanted)) throw new Error("Nama salinan tidak valid.");
  const path = `${dir}/${wanted}`;
  if (fileExists(path)) throw new Error(`“${wanted}” sudah ada di folder ini.`);
  let attachmentId: string | undefined;
  if (file.attachmentId) {
    const { loadAttachment, saveAttachment } = await import("./attachment-store");
    const blob = await loadAttachment(file.attachmentId);
    if (!blob) throw new Error("Isi file asli tidak bisa dibaca.");
    attachmentId = crypto.randomUUID();
    await saveAttachment(attachmentId, blob);
  }
  const copy: SavedFile = {
    ...file,
    path,
    ask: "Salinan file",
    failed: false,
    updatedAt: Date.now(),
  };
  delete copy.key;
  delete copy.sessionId;
  delete copy.sessionTitle;
  if (attachmentId) copy.attachmentId = attachmentId;
  copy.key = crypto.randomUUID();
  state = { ...state, attachments: [copy, ...state.attachments] };
  save();
  emit();
  return copy;
}

/* ---------- sinkronisasi sandbox → File Manager ---------- */

const syncing = new Map<string, Promise<void>>();
/** Ambil isi /home/user dari sandbox sesi supaya hasil terminal (mkdir, cp, dll) muncul di File Manager. */
export function syncSandboxFiles(sessionId: string) {
  const sandboxId = getSession(sessionId)?.sandboxId;
  if (!sandboxId || typeof window === "undefined") return Promise.resolve();
  const running = syncing.get(sandboxId);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch("/api/sandbox-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        dirs?: string[];
        files?: { path: string; size: number; content: string; binary: boolean; mtime: number }[];
      };
      if (!Array.isArray(data.files)) return;
      const title = getSession(sessionId)?.title;
      const prev = new Map(state.attachments.filter((f) => f.key?.startsWith("sb:")).map((f) => [f.path, f]));
      const synced: SavedFile[] = data.files
        .filter((f) => !f.path.startsWith(`${SANDBOX_ROOT}/attached_assets/`))
        .map((f) => {
          const old = prev.get(f.path);
          const same = old && old.content === f.content && old.size === f.size;
          return {
            path: f.path,
            content: f.content,
            runId: "sandbox",
            ask: "Dibuat lewat terminal / perintah",
            failed: false,
            updatedAt: same ? old.updatedAt : Math.max(f.mtime || 0, Date.now() - 1000),
            sessionId,
            ...(title ? { sessionTitle: title } : {}),
            mediaType: f.binary ? "application/octet-stream" : "text/plain",
            size: f.size,
            ...(f.binary ? { truncated: true } : {}),
            key: `sb:${f.path}`,
          };
        });
      const others = state.attachments.filter((f) => !f.key?.startsWith("sb:"));
      state = { ...state, attachments: [...synced, ...others] };
      save();
      emit();
      if (Array.isArray(data.dirs)) addFolders(data.dirs);
    } catch {
      /* sandbox offline: abaikan */
    } finally {
      syncing.delete(sandboxId);
    }
  })();
  syncing.set(sandboxId, job);
  return job;
}

/** Hasil form secret masuk ke respons AI yang sama (tanpa mengirim pesan baru). */
export function applySecretResults(
  sessionId: string,
  runIds: string[],
  results: { name: string; status: string; account?: string | undefined; detail?: string | undefined }[],
) {
  const lines = results.map((r) =>
    r.status === "active"
      ? `- **${r.name}** aktif${r.account ? ` · terhubung ke **${r.account}**` : ""} · tersimpan aman`
      : `- **${r.name}** ${r.detail ?? "belum aktif"}`,
  );
  const allOk = results.every((r) => r.status === "active");
  const text = `\n\n${allOk ? "Token sudah dicek dan disimpan:" : "Hasil pengecekan token:"}\n${lines.join("\n")}`;
  updateSessions((sessions) =>
    sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const idx = s.messages.findIndex((m) => m.parts.some((p) => p.type === "tool" && runIds.includes(p.run.id)));
      if (idx < 0) return s;
      const messages = s.messages.map((m, i) =>
        i === idx ? { ...m, parts: [...m.parts, { type: "text" as const, text }] } : m,
      );
      return { ...s, messages, updatedAt: Date.now() };
    }),
  );
}
