import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Bot, ChevronRight, Loader2, Plus, Square, Terminal, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WenGPT — asisten AI dengan sandbox" },
      { name: "description", content: "Ngobrol dengan WenGPT. Kalau perlu, AI bisa menjalankan perintah dan package di sandbox Linux." },
      { property: "og:title", content: "WenGPT — asisten AI dengan sandbox" },
      { property: "og:description", content: "Ngobrol dengan WenGPT. Kalau perlu, AI bisa menjalankan perintah dan package di sandbox Linux." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});

type ToolIn = { command?: string; path?: string; content?: string };
type ToolOut = { exitCode?: number; stdout?: string; stderr?: string; ok?: boolean };
type ToolRun = { id: string; name: string; input: ToolIn; output?: ToolOut };
type Part = { type: "text"; text: string } | { type: "tool"; run: ToolRun };
type Message = { id: string; role: "user" | "assistant"; parts: Part[] };

const STORE = "wengpt:chat";
const STARTERS = [
  "Halo! Kamu bisa bantu apa aja?",
  "Install pandas lalu hitung rata-rata dari 10 angka acak",
  "Cek versi Python dan Node di sandbox",
  "Jelaskan bedanya REST dan GraphQL",
];

function toText(m: Message): string {
  return m.parts
    .map((p) => {
      if (p.type === "text") return p.text;
      const o = p.run.output ?? {};
      return `\n[Tool ${p.run.name} ${JSON.stringify(p.run.input).slice(0, 300)} → ${JSON.stringify(o).slice(0, 800)}]\n`;
    })
    .join("");
}

function ToolCard({ run }: { run: ToolRun }) {
  const done = !!run.output;
  const o: ToolOut = run.output ?? {};
  const failed = done && ((typeof o.exitCode === "number" && o.exitCode !== 0) || o.ok === false);
  const label = run.name === "run_command" ? String(run.input.command ?? "") : `Tulis ${String(run.input.path ?? "")}`;
  const Icon = run.name === "run_command" ? Terminal : FileText;
  return (
    <details className="group my-2 rounded-lg border border-border bg-muted/40 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <ChevronRight className="size-3.5 shrink-0 transition group-open:rotate-90" />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{label}</code>
        {!done ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn("text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
            {failed ? "gagal" : "selesai"}
          </span>
        )}
      </summary>
      <div className="border-t border-border px-3 py-2">
        {run.name === "write_file" && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">{String(run.input.content ?? "")}</pre>
        )}
        {done && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {run.name === "run_command"
              ? `${String(o.stdout ?? "")}${o.stderr ? `\n${String(o.stderr)}` : ""}\n[exit ${String(o.exitCode)}]`
              : JSON.stringify(o, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "{}");
      if (Array.isArray(s.messages)) setMessages(s.messages);
      if (s.sandboxId) setSandboxId(s.sandboxId);
    } catch {}
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!streaming) localStorage.setItem(STORE, JSON.stringify({ messages, sandboxId }));
  }, [messages, sandboxId, streaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || streaming) return;
      setInput("");
      const history: Message[] = [...messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: prompt }] }];
      const aid = crypto.randomUUID();
      setMessages([...history, { id: aid, role: "assistant", parts: [] }]);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      const update = (fn: (parts: Part[]) => Part[]) =>
        setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, parts: fn(m.parts) } : m)));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            sandboxId,
            messages: history.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: toText(m) }] })),
          }),
        });
        if (!res.ok || !res.body) throw new Error((await res.text()) || "WenGPT tidak merespons.");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.t === "text" || e.t === "error") {
              const v = e.t === "error" ? `\n\n**${e.v}**` : e.v;
              update((parts) => {
                const last = parts[parts.length - 1];
                if (last?.type === "text") return [...parts.slice(0, -1), { type: "text", text: last.text + v }];
                return [...parts, { type: "text", text: v }];
              });
            } else if (e.t === "sandbox") setSandboxId(e.id);
            else if (e.t === "tool")
              update((parts) => [...parts, { type: "tool", run: { id: e.id, name: e.name, input: e.input ?? {} } }]);
            else if (e.t === "result")
              update((parts) =>
                parts.map((p) => (p.type === "tool" && p.run.id === e.id ? { type: "tool", run: { ...p.run, output: e.output } } : p)),
              );
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          update((parts) => [...parts, { type: "text", text: `\n\n**${(err as Error).message}**` }]);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [messages, sandboxId, streaming],
  );

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSandboxId(null);
    localStorage.removeItem(STORE);
    inputRef.current?.focus();
  };

  const last = messages[messages.length - 1];
  const waiting = streaming && last?.role === "assistant" && last.parts.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </span>
          <span className="font-semibold">WenGPT</span>
        </div>
        <button onClick={reset} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
          <Plus className="size-4" /> Chat baru
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="pt-16 text-center">
              <h1 className="text-2xl font-semibold">Mau ngobrol apa hari ini?</h1>
              <p className="mt-2 text-sm text-muted-foreground">WenGPT bisa ngobrol, dan menjalankan perintah di sandbox kalau perlu.</p>
              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-lg border border-border p-3 text-left text-sm hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground">
                      {toText(m)}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="prose prose-sm max-w-none dark:prose-invert">
                    {m.parts.map((p, i) =>
                      p.type === "text" ? <ReactMarkdown key={i}>{p.text}</ReactMarkdown> : <ToolCard key={p.run.id} run={p.run} />,
                    )}
                  </div>
                ),
              )}
              {waiting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> WenGPT sedang berpikir…
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mx-auto w-full max-w-3xl px-4 pb-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Tulis pesan…"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          {streaming ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="grid size-9 place-items-center rounded-full bg-muted">
              <Square className="size-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
