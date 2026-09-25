import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  Code2,
  Hammer,
  Loader2,
  MonitorPlay,
  MessageSquare,
  RefreshCw,
  Square,
} from "lucide-react";
import { extractCode, stripCode } from "@/lib/extract-code";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Foundry — build web apps by chatting" },
      {
        name: "description",
        content:
          "Describe an app, watch it get written, and run it instantly in a live sandbox preview.",
      },
      { property: "og:title", content: "Foundry — build web apps by chatting" },
      {
        property: "og:description",
        content:
          "Describe an app, watch it get written, and run it instantly in a live sandbox preview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Builder,
});

type Message = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = [
  "A pomodoro timer with a circular progress ring",
  "A markdown note pad with local saving",
  "A snake game with neon trails",
  "A currency converter with a clean dashboard",
];

function Builder() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [mobileView, setMobileView] = useState<"chat" | "app">("chat");
  const [previewKey, setPreviewKey] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!streaming) {
      setWaitSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [streaming]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || streaming) return;

      setError(null);
      setInput("");
      const history: Message[] = [
        ...messages,
        { id: crypto.randomUUID(), role: "user", content: prompt },
      ];
      const assistantId = crypto.randomUUID();
      setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map((m) => ({
              id: m.id,
              role: m.role,
              parts: [{ type: "text", text: m.content }],
            })),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error((await response.text()) || "The builder could not respond.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          const snapshot = full;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
          );
          const partialBuild = extractCode(snapshot);
          if (partialBuild) setCode(partialBuild);
        }

        const built = extractCode(full);
        if (built) {
          setCode(built);
          setPreviewKey((k) => k + 1);
          setTab("preview");
          setMobileView("app");
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [messages, streaming],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Hammer className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Foundry</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              chat · build · run
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-border bg-card/70 p-1 md:hidden">
          <MobileTab
            active={mobileView === "chat"}
            onClick={() => setMobileView("chat")}
            icon={<MessageSquare className="size-3.5" />}
            label="Chat"
          />
          <MobileTab
            active={mobileView === "app"}
            onClick={() => setMobileView("app")}
            icon={<MonitorPlay className="size-3.5" />}
            label="App"
          />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Chat */}
        <section
          className={cn(
            "flex min-h-0 flex-col border-border/70 md:border-r",
            mobileView === "chat" ? "flex" : "hidden md:flex",
          )}
        >
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <div className="space-y-5 pt-6">
                <h1 className="text-2xl font-semibold leading-snug tracking-tight">
                  What should we <span className="text-gradient">build</span> today?
                </h1>
                <p className="text-sm text-muted-foreground">
                  Describe an app. It gets written and runs instantly in a sandbox next to you.
                </p>
                <div className="grid gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-border bg-card/60 px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, index) => (
                <Bubble
                  key={m.id}
                  message={m}
                  streaming={streaming && index === messages.length - 1}
                  waitSeconds={waitSeconds}
                />
              ))
            )}

            {error && (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive-foreground">
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-border/70 p-3"
          >
            <div className="panel flex items-end gap-2 p-2">
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Describe your app, or ask for a change…"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                  aria-label="Stop"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Sandbox */}
        <section
          className={cn(
            "flex min-h-0 flex-col bg-background/40",
            mobileView === "app" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card/70 p-1">
              <PanelTab
                active={tab === "preview"}
                onClick={() => setTab("preview")}
                icon={<MonitorPlay className="size-3.5" />}
                label="Preview"
              />
              <PanelTab
                active={tab === "code"}
                onClick={() => setTab("code")}
                icon={<Code2 className="size-3.5" />}
                label="Code"
              />
            </div>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              disabled={!code}
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Reload preview"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 p-3">
            {!code ? (
              <div className="panel grid h-full place-items-center px-6 text-center">
                <div className="space-y-2">
                  {streaming ? (
                    <Loader2 className="mx-auto size-5 animate-spin text-primary" />
                  ) : (
                    <MonitorPlay className="mx-auto size-5 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {streaming
                      ? waitSeconds < 20
                        ? "Connecting to the AI server…"
                        : `The Kaggle model is working… ${waitSeconds}s`
                      : "Your running app will appear here."}
                  </p>
                </div>
              </div>
            ) : tab === "preview" ? (
              <iframe
                key={previewKey}
                title="Sandbox preview"
                srcDoc={code}
                sandbox="allow-scripts allow-modals allow-forms allow-popups"
                className="h-full w-full rounded-xl border border-border bg-white"
              />
            ) : (
              <pre className="panel h-full overflow-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {code}
              </pre>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Bubble({
  message,
  streaming,
  waitSeconds,
}: {
  message: Message;
  streaming: boolean;
  waitSeconds: number;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  const text = stripCode(message.content);
  const hasCode = Boolean(extractCode(message.content));

  return (
    <div className="space-y-2">
      {text ? (
        <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground [&_a]:text-primary [&_code]:font-mono [&_code]:text-primary [&_p]:my-2 [&_strong]:text-foreground">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      ) : (
        streaming && !message.content && (
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              {waitSeconds < 20 ? "Connecting to the AI server…" : "The Kaggle model is working…"}
            </p>
            {waitSeconds >= 20 && (
              <p className="pl-5 font-mono text-[11px]">{waitSeconds}s elapsed · first response can take 2–3 minutes</p>
            )}
          </div>
        )
      )}
      {hasCode && (
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 font-mono text-[11px] text-accent">
          <Code2 className="size-3" /> app.html updated
        </p>
      )}
    </div>
  );
}

function PanelTab(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        props.active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function MobileTab(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        props.active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
