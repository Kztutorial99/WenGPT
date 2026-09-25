export type ToolOut = { exitCode?: number; stdout?: string; stderr?: string; ok?: boolean; error?: string; path?: string; bytes?: number };
export type ToolRun = {
  id: string;
  name: string;
  input: { command?: string; path?: string; content?: string };
  output?: ToolOut;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
};
export type Part = { type: "text"; text: string } | { type: "tool"; run: ToolRun };
export type MessageData = { id: string; role: "user" | "assistant"; parts: Part[]; createdAt: number };
export type ChatSession = { id: string; title: string; createdAt: number; updatedAt: number; sandboxId: string | null; messages: MessageData[] };
export type Checkpoint = { id: string; ask: string; startedAt: number; runs: ToolRun[] };
export type SavedFile = { path: string; content: string; runId: string; ask: string; failed: boolean; updatedAt: number };
type State = { ready: boolean; sessions: ChatSession[]; activeId: string | null; streamingIds: string[] };

const STORE = "wengpt:sessions:v2";
const LEGACY = "wengpt:chat";
let state: State = { ready: false, sessions: [], activeId: null, streamingIds: [] };
const serverState: State = { ready: false, sessions: [], activeId: null, streamingIds: [] };
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();

function emit() { listeners.forEach((listener) => listener()); }
function save() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE, JSON.stringify({ sessions: state.sessions, activeId: state.activeId }));
}
function updateSessions(updater: (sessions: ChatSession[]) => ChatSession[]) {
  state = { ...state, sessions: updater(state.sessions) };
  save();
  emit();
}
function newSession(): ChatSession {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: "Chat baru", createdAt: now, updatedAt: now, sandboxId: null, messages: [] };
}

export function bootChatStore() {
  if (state.ready || typeof window === "undefined") return;
  let sessions: ChatSession[] = [];
  let activeId: string | null = null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || "null") as { sessions?: ChatSession[]; activeId?: string } | null;
    if (Array.isArray(stored?.sessions)) sessions = stored.sessions;
    if (typeof stored?.activeId === "string") activeId = stored.activeId;
  } catch { localStorage.removeItem(STORE); }
  if (sessions.length === 0) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY) || "null") as { messages?: MessageData[]; sandboxId?: string } | null;
      if (Array.isArray(legacy?.messages) && legacy.messages.length) {
        const now = Date.now();
        sessions = [{ id: crypto.randomUUID(), title: titleFrom(legacy.messages), createdAt: now, updatedAt: now, sandboxId: legacy.sandboxId ?? null, messages: legacy.messages.map((m) => ({ ...m, createdAt: m.createdAt ?? now })) }];
      }
    } catch { localStorage.removeItem(LEGACY); }
  }
  if (sessions.length === 0) sessions = [newSession()];
  if (!activeId || !sessions.some((s) => s.id === activeId)) activeId = sessions[0]?.id ?? null;
  state = { ...state, ready: true, sessions, activeId };
  save(); emit();
}

export function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function getSnapshot() { return state; }
export function getServerSnapshot(): State { return serverState; }
export function getSession(id: string) { return state.sessions.find((session) => session.id === id); }
export function setActiveSession(id: string) { if (state.activeId !== id) { state = { ...state, activeId: id }; save(); emit(); } }
export function createSession() {
  const session = newSession();
  state = { ...state, sessions: [session, ...state.sessions], activeId: session.id };
  save(); emit(); return session.id;
}
export function deleteSession(id: string) {
  controllers.get(id)?.abort(); controllers.delete(id);
  let sessions = state.sessions.filter((session) => session.id !== id);
  if (!sessions.length) sessions = [newSession()];
  const activeId = state.activeId === id ? sessions[0]?.id ?? null : state.activeId;
  state = { ...state, sessions, activeId, streamingIds: state.streamingIds.filter((value) => value !== id) };
  save(); emit();
  return activeId;
}
export function stopSession(id: string) { controllers.get(id)?.abort(); }
export function isStreaming(id: string) { return state.streamingIds.includes(id); }

function titleFrom(messages: MessageData[]) {
  const first = messages.find((m) => m.role === "user")?.parts.find((p) => p.type === "text");
  const text = first?.type === "text" ? first.text.trim().replace(/\s+/g, " ") : "Chat baru";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text || "Chat baru";
}
function summarizeTool(part: Extract<Part, { type: "tool" }>) {
  const { name, input, output } = part.run;
  if (name === "write_file") return output?.ok === false ? `(Gagal menulis ${input.path}: ${output.error ?? "error"})` : `(File ${input.path} berhasil ditulis.)`;
  const result = output ? `exit ${output.exitCode ?? "?"}\n${(output.stdout || output.stderr || "").slice(0, 500)}` : "belum selesai";
  return `(Perintah ${String(input.command ?? "").slice(0, 250)} — ${result})`;
}
function messageText(message: MessageData) { return message.parts.map((part) => part.type === "text" ? part.text : `\n${summarizeTool(part)}\n`).join(""); }
function patchSession(id: string, updater: (session: ChatSession) => ChatSession) {
  updateSessions((sessions) => sessions.map((session) => session.id === id ? updater(session) : session));
}
function patchAssistant(sessionId: string, assistantId: string, updater: (parts: Part[]) => Part[]) {
  patchSession(sessionId, (session) => ({ ...session, updatedAt: Date.now(), messages: session.messages.map((message) => message.id === assistantId ? { ...message, parts: updater(message.parts) } : message) }));
}

export async function sendMessage(sessionId: string, raw: string) {
  const prompt = raw.trim();
  const session = getSession(sessionId);
  if (!prompt || !session || isStreaming(sessionId)) return;
  const now = Date.now();
  const user: MessageData = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: prompt }], createdAt: now };
  const assistant: MessageData = { id: crypto.randomUUID(), role: "assistant", parts: [], createdAt: now + 1 };
  const history = [...session.messages, user];
  patchSession(sessionId, (current) => ({ ...current, title: current.messages.length ? current.title : titleFrom([user]), updatedAt: now, messages: [...history, assistant] }));
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  state = { ...state, streamingIds: [...state.streamingIds, sessionId] }; emit();
  try {
    const response = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ sessionId, sandboxId: session.sandboxId, messages: history.slice(-16).map((message) => ({ id: message.id, role: message.role, parts: [{ type: "text", text: messageText(message) }] })) }),
    });
    if (!response.ok || !response.body) throw new Error((await response.text()) || "WenGPT tidak merespons.");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { t: string; [key: string]: unknown };
        if (event.t === "text" || event.t === "error") {
          const valueText = event.t === "error" ? `\n\n**${String(event['v'])}**` : String(event['v'] ?? "");
          patchAssistant(sessionId, assistant.id, (parts) => {
            const last = parts.at(-1);
            return last?.type === "text" ? [...parts.slice(0, -1), { type: "text", text: last.text + valueText }] : [...parts, { type: "text", text: valueText }];
          });
        } else if (event.t === "sandbox") {
          patchSession(sessionId, (current) => ({ ...current, sandboxId: String(event['id']) }));
        } else if (event.t === "sandbox_reset") {
          patchAssistant(sessionId, assistant.id, (parts) => [...parts, { type: "text", text: "\n\n> Sandbox sesi sebelumnya sudah berakhir. Saya membuat lingkungan baru; paket sementara perlu dipasang ulang.\n\n" }]);
        } else if (event.t === "tool") {
          patchAssistant(sessionId, assistant.id, (parts) => [...parts, { type: "tool", run: { id: String(event['id']), name: String(event['name']), input: (event['input'] ?? {}) as ToolRun["input"], startedAt: Number(event['at']) || Date.now() } }]);
        } else if (event.t === "result") {
          patchAssistant(sessionId, assistant.id, (parts) => parts.map((part) => part.type === "tool" && part.run.id === event['id'] ? { type: "tool", run: { ...part.run, output: event['output'] as ToolOut, finishedAt: Number(event['at']) || Date.now(), ...(Number(event['durationMs']) ? { durationMs: Number(event['durationMs']) } : {}) } } : part));
        }
      }
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") patchAssistant(sessionId, assistant.id, (parts) => [...parts, { type: "text", text: `\n\n**${(error as Error).message}**` }]);
  } finally {
    controllers.delete(sessionId);
    state = { ...state, streamingIds: state.streamingIds.filter((id) => id !== sessionId) }; save(); emit();
  }
}

export function loadCheckpoints(sessionId: string): Checkpoint[] {
  const list: Checkpoint[] = []; let current: Checkpoint | null = null;
  for (const message of getSession(sessionId)?.messages ?? []) {
    if (message.role === "user") { const part = message.parts.find((p) => p.type === "text"); current = { id: message.id, ask: part?.type === "text" ? part.text : "", startedAt: message.createdAt, runs: [] }; list.push(current); continue; }
    for (const part of message.parts) if (part.type === "tool" && current) current.runs.push(part.run);
  }
  return list.filter((checkpoint) => checkpoint.runs.length);
}
export function normalizePath(path: string) { return path.startsWith("/") ? path : `/home/user/${path}`; }
export function loadFiles(sessionId: string): SavedFile[] {
  const map = new Map<string, SavedFile>();
  for (const checkpoint of loadCheckpoints(sessionId)) for (const run of checkpoint.runs) {
    if (run.name !== "write_file" || !run.input.path) continue;
    const path = normalizePath(run.input.path); map.delete(path);
    map.set(path, { path, content: String(run.input.content ?? ""), runId: run.id, ask: checkpoint.ask, failed: run.output?.ok === false, updatedAt: run.finishedAt ?? run.startedAt });
  }
  return [...map.values()].reverse();
}
