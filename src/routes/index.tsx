import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, FileText, History, Plus, Terminal } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WenGPT — asisten AI dengan sandbox" },
      { name: "description", content: "Ngobrol dengan WenGPT dan jalankan pekerjaan di sandbox Linux saat diperlukan." },
      { property: "og:title", content: "WenGPT — asisten AI dengan sandbox" },
      { property: "og:description", content: "Ngobrol dengan WenGPT dan jalankan pekerjaan di sandbox Linux saat diperlukan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});

type ToolIn = { command?: string; path?: string; content?: string };
type ToolOut = { exitCode?: number; stdout?: string; stderr?: string; ok?: boolean; error?: string };
type ToolRun = { id: string; name: string; input: ToolIn; output?: ToolOut };
type Part = { type: "text"; text: string } | { type: "tool"; run: ToolRun };
type MessageData = { id: string; role: "user" | "assistant"; parts: Part[] };

const STORE = "wengpt:chat";
const STARTERS = [
  "Kamu bisa bantu apa saja?",
  "Install pandas lalu hitung rata-rata 10 angka acak",
  "Cek versi Python dan Node di sandbox",
  "Jelaskan perbedaan REST dan GraphQL",
];

function toText(message: MessageData): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") return part.text;
      return `\n[Tool ${part.run.name}: ${JSON.stringify(part.run.input).slice(0, 300)} → ${JSON.stringify(part.run.output ?? {}).slice(0, 800)}]\n`;
    })
    .join("");
}

function ToolCard({ run }: { run: ToolRun }) {
  const output = run.output;
  const failed = !!output && ((typeof output.exitCode === "number" && output.exitCode !== 0) || output.ok === false);
  const command = run.name === "run_command";
  const label = command ? String(run.input.command ?? "Perintah terminal") : `Tulis ${String(run.input.path ?? "file")}`;
  const status = !output ? "Berjalan…" : failed ? "Gagal" : "Selesai";
  return (
    <Link
      to="/linimasa"
      hash={run.id}
      className="my-2 flex min-w-0 items-center gap-2.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-card/80"
    >
      {command ? <Terminal className="size-4 shrink-0 text-primary" /> : <FileText className="size-4 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{label}</span>
      <span className={`shrink-0 text-[11px] ${failed ? "text-destructive" : output ? "text-success" : "text-muted-foreground"}`}>{status}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Chat() {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
      if (Array.isArray(saved.messages)) setMessages(saved.messages);
      if (typeof saved.sandboxId === "string") setSandboxId(saved.sandboxId);
    } catch {
      localStorage.removeItem(STORE);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ messages, sandboxId }));
  }, [messages, sandboxId]);

  const send = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || streaming) return;
    setInput("");
    const history: MessageData[] = [...messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: prompt }] }];
    const assistantId = crypto.randomUUID();
    setMessages([...history, { id: assistantId, role: "assistant", parts: [] }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (fn: (parts: Part[]) => Part[]) =>
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, parts: fn(message.parts) } : message));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sandboxId,
          messages: history.map((message) => ({ id: message.id, role: message.role, parts: [{ type: "text", text: toText(message) }] })),
        }),
      });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "WenGPT tidak merespons.");
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
          const event = JSON.parse(line);
          if (event.t === "text" || event.t === "error") {
            const value = event.t === "error" ? `\n\n**${event.v}**` : event.v;
            update((parts) => {
              const last = parts.at(-1);
              return last?.type === "text"
                ? [...parts.slice(0, -1), { type: "text", text: last.text + value }]
                : [...parts, { type: "text", text: value }];
            });
          } else if (event.t === "sandbox") setSandboxId(event.id);
          else if (event.t === "tool") update((parts) => [...parts, { type: "tool", run: { id: event.id, name: event.name, input: event.input ?? {} } }]);
          else if (event.t === "result") update((parts) => parts.map((part) => part.type === "tool" && part.run.id === event.id ? { type: "tool", run: { ...part.run, output: event.output } } : part));
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") update((parts) => [...parts, { type: "text", text: `\n\n**${(error as Error).message}**` }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [messages, sandboxId, streaming]);

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSandboxId(null);
    setInput("");
    localStorage.removeItem(STORE);
    inputRef.current?.focus();
  };

  const last = messages.at(-1);
  const waiting = streaming && last?.role === "assistant" && !last.parts.some((part) => part.type === "text" && part.text.trim());

  return (
    <main className="chat-shell flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 bg-background/75 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/80 bg-card shadow-panel">
            <Bot className="size-4 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">WenGPT</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success shadow-status" /> Siap membantu
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground" title="Linimasa eksekusi">
          <Link to="/linimasa"><History className="size-4" /> <span className="hidden sm:inline">Linimasa</span></Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="shrink-0 text-muted-foreground" title="Mulai chat baru">
          <Plus className="size-4" /> <span className="hidden sm:inline">Chat baru</span>
        </Button>
        </div>
      </header>

      <Conversation className="min-h-0 min-w-0">
        <ConversationContent className="mx-auto min-h-full w-full min-w-0 max-w-3xl gap-7 px-3 py-6 sm:px-6 sm:py-8">
          {messages.length === 0 ? (
            <section className="flex min-h-[65dvh] flex-col items-center justify-center px-1 text-center">
              <span className="mb-5 grid size-12 place-items-center rounded-lg border border-border/80 bg-card/70 shadow-glow backdrop-blur-xl">
                <Bot className="size-5 text-primary" />
              </span>
              <h2 className="text-balance text-2xl font-semibold sm:text-3xl">Mau mengerjakan apa hari ini?</h2>
              <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-muted-foreground">Ngobrol, cari jawaban, atau jalankan pekerjaan langsung di sandbox.</p>
              <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <Button key={starter} type="button" variant="outline" onClick={() => send(starter)} className="h-auto min-w-0 justify-start whitespace-normal bg-card/45 px-3 py-3 text-left text-sm leading-5 backdrop-blur-xl">
                    <span className="min-w-0 break-words">{starter}</span>
                  </Button>
                ))}
              </div>
            </section>
          ) : messages.map((message) => (
            <Message key={message.id} from={message.role} className="min-w-0 max-w-full">
              {message.role === "assistant" && (
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="grid size-6 place-items-center rounded-sm border border-border/70 bg-card"><Bot className="size-3.5 text-primary" /></span>
                  WenGPT
                </div>
              )}
              <MessageContent className={message.role === "user" ? "max-w-[88%] overflow-visible rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-user sm:max-w-[75%]" : "w-full overflow-visible"}>
                {message.parts.map((part, index) => part.type === "text"
                  ? <MessageResponse key={`${message.id}-${index}`} isAnimating={streaming && message.id === last?.id} className="wengpt-markdown min-w-0 max-w-full">{part.text}</MessageResponse>
                  : <ToolCard key={part.run.id} run={part.run} />)}
                {waiting && message.id === last?.id && <Shimmer className="text-sm">WenGPT sedang berpikir…</Shimmer>}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3 z-30 size-9 border-border/70 bg-card/90 shadow-panel backdrop-blur-xl" aria-label="Kembali ke pesan terbaru" />
      </Conversation>

      <footer className="relative z-20 shrink-0 border-t border-border/40 bg-background/78 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
        <PromptInput
          onSubmit={({ text }) => send(text)}
          className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border-border/70 bg-card/65 shadow-panel backdrop-blur-xl focus-within:border-ring/60"
        >
          <PromptInputTextarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Tulis pesan untuk WenGPT…"
            className="min-h-12 max-h-40 min-w-0 px-4 pt-3 pb-1 text-base leading-6 sm:text-sm"
          />
          <PromptInputFooter className="min-h-10 px-2 pb-2">
            <span className="truncate pl-1 text-[11px] text-muted-foreground">Enter kirim · Shift + Enter baris baru</span>
            <PromptInputSubmit
              status={streaming ? "streaming" : "ready"}
              onStop={() => abortRef.current?.abort()}
              disabled={!streaming && !input.trim()}
              className="size-8 shrink-0 rounded-lg"
            />
          </PromptInputFooter>
        </PromptInput>
      </footer>
    </main>
  );
}