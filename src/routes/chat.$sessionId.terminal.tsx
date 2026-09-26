import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, SquareTerminal } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import { getSession, setSessionSandbox, syncSandboxFiles } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";

export const Route = createFileRoute("/chat/$sessionId/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal — WenGPT" },
      { name: "description", content: "Terminal shell asli di sandbox sesi WenGPT." },
      { property: "og:title", content: "Terminal — WenGPT" },
      { property: "og:description", content: "Terminal shell asli di sandbox sesi WenGPT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TerminalPage,
});

// Riwayat layar terminal per sesi (bertahan saat pindah menu) supaya tidak terlihat ter-reset.
const screens = new Map<string, { chunks: Uint8Array[]; size: number }>();
const MAX_SCREEN = 400_000;
function remember(sessionId: string, chunk: Uint8Array) {
  const s = screens.get(sessionId) ?? { chunks: [], size: 0 };
  s.chunks.push(chunk);
  s.size += chunk.length;
  while (s.size > MAX_SCREEN && s.chunks.length > 1) s.size -= s.chunks.shift()!.length;
  screens.set(sessionId, s);
}

type Status = "connecting" | "online" | "closed" | "error";
const KEYS: { label: string; seq: string }[] = [
  { label: "Esc", seq: "\x1b" },
  { label: "Tab", seq: "\t" },
  { label: "Ctrl+C", seq: "\x03" },
  { label: "Ctrl+D", seq: "\x04" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "←", seq: "\x1b[D" },
  { label: "→", seq: "\x1b[C" },
  { label: "clear", seq: "clear\r" },
];

function cssColor(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function TerminalPage() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(data: string) => void>(() => {});
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!snapshot.ready || !hostRef.current) return;
    const host = hostRef.current;
    const abort = new AbortController();
    let disposed = false;
    let cleanup = () => {};
    setStatus("connecting");
    setError("");

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: window.innerWidth < 640 ? 12 : 13,
        lineHeight: 1.25,
        scrollback: 3000,
        smoothScrollDuration: 0,
        theme: {
          background: cssColor("--background"),
          foreground: cssColor("--foreground"),
          cursor: cssColor("--primary"),
          selectionBackground: "rgba(220, 60, 60, 0.35)",
          red: cssColor("--primary"),
          green: cssColor("--success"),
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      for (const chunk of screens.get(sessionId)?.chunks ?? []) term.write(chunk);

      const pidKey = `wengpt:pty:${sessionId}`;
      let sandboxId = getSession(sessionId)?.sandboxId ?? null;
      let pid: number | null = Number(sessionStorage.getItem(pidKey)) || null;
      const queue: string[] = [];
      let flushing = false;

      const post = (payload: Record<string, unknown>) =>
        fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      const flush = async () => {
        if (flushing || !sandboxId || !pid) return;
        flushing = true;
        while (queue.length) {
          const data = queue.splice(0).join("");
          await post({ action: "input", sandboxId, pid, data }).catch(() => {});
        }
        flushing = false;
      };
      // Sinkronkan File Manager setelah perintah dijalankan (Enter).
      let syncTimer = 0;
      const scheduleSync = () => {
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => void syncSandboxFiles(sessionId), 1500);
      };
      const send = (data: string) => {
        queue.push(data);
        if (data.includes("\r")) scheduleSync();
        void flush();
      };
      sendRef.current = (data) => {
        send(data);
        term.focus();
      };
      const input = term.onData(send);

      // Gabungkan output per frame supaya render tetap mulus.
      let pending: Uint8Array[] = [];
      let frame = 0;
      const writeOut = (chunk: Uint8Array) => {
        remember(sessionId, chunk);
        pending.push(chunk);
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const parts = pending;
          pending = [];
          const size = parts.reduce((n, p) => n + p.length, 0);
          const merged = new Uint8Array(size);
          let at = 0;
          for (const p of parts) {
            merged.set(p, at);
            at += p.length;
          }
          term.write(merged);
        });
      };

      let resizeTimer = 0;
      const onResize = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          fit.fit();
          if (sandboxId && pid)
            void post({ action: "resize", sandboxId, pid, cols: term.cols, rows: term.rows }).catch(
              () => {},
            );
        }, 120);
      };
      const observer = new ResizeObserver(onResize);
      observer.observe(host);

      cleanup = () => {
        observer.disconnect();
        input.dispose();
        cancelAnimationFrame(frame);
        window.clearTimeout(syncTimer);
        void syncSandboxFiles(sessionId);
        term.dispose();
      };

      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open", sandboxId, pid, cols: term.cols, rows: term.rows }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Terminal tidak bisa dibuka.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as { t?: string; v?: string; id?: string; fresh?: boolean; pid?: number };
            if (event.t === "data") {
              const bin = atob(String(event.v));
              writeOut(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
            } else if (event.t === "sandbox") {
              sandboxId = String(event.id);
              setSessionSandbox(sessionId, sandboxId);
              if (event.fresh) {
                sessionStorage.removeItem(pidKey);
                if (screens.has(sessionId)) {
                  screens.delete(sessionId);
                  term.reset();
                }
              }
            } else if (event.t === "pid") {
              const reused = pid === Number(event.pid);
              pid = Number(event.pid);
              if (!reused && screens.has(sessionId)) {
                screens.delete(sessionId);
                term.reset();
              }
              if (reused) void post({ action: "resize", sandboxId, pid, cols: term.cols, rows: term.rows }).catch(() => {});
              sessionStorage.setItem(pidKey, String(pid));
              setStatus("online");
              term.focus();
              void flush();
            } else if (event.t === "exit") {
              sessionStorage.removeItem(pidKey);
              term.write("\r\n\x1b[2m[shell selesai]\x1b[0m\r\n");
              setStatus("closed");
            } else if (event.t === "error") {
              throw new Error(String(event.v));
            }
          }
        }
        if (!disposed) setStatus((current) => (current === "online" ? "closed" : current));
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Terminal terputus.");
      }
    })();

    return () => {
      disposed = true;
      abort.abort();
      cleanup();
    };
  }, [snapshot.ready, sessionId, attempt]);

  const label =
    status === "online"
      ? "Terhubung"
      : status === "connecting"
        ? "Menghubungkan…"
        : status === "closed"
          ? "Terputus"
          : "Gagal";

  return (
    <main className="fixed inset-0 flex h-dvh flex-col bg-background text-foreground">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-background/88 px-4 py-3 backdrop-blur-xl">
        <Button asChild variant="outline" size="icon">
          <Link to="/chat/$sessionId" params={{ sessionId }} aria-label="Kembali ke chat">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SquareTerminal className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">Terminal</h1>
          </div>
          <p className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            <span
              className={`size-1.5 shrink-0 rounded-full ${status === "online" ? "bg-success" : status === "connecting" ? "animate-pulse bg-primary" : "bg-destructive"}`}
            />
            {label} · user@sandbox:~
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          title="Mulai ulang shell"
          aria-label="Mulai ulang shell"
          onClick={() => {
            sessionStorage.removeItem(`wengpt:pty:${sessionId}`);
            screens.delete(sessionId);
            setAttempt((n) => n + 1);
          }}
        >
          <RotateCcw className="size-4" />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1 p-2 sm:p-4">
        <div className="h-full overflow-hidden rounded-xl border border-border/70 bg-background shadow-panel">
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-card/70 px-3 py-2">
            <span className="size-2.5 rounded-full bg-primary" />
            <span className="size-2.5 rounded-full bg-muted-foreground/40" />
            <span className="size-2.5 rounded-full bg-muted-foreground/40" />
            <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">
              bash — /home/user
            </span>
          </div>
          <div ref={hostRef} className="h-[calc(100%-2.25rem)] w-full px-2 py-1.5" />
        </div>
        {status === "error" && (
          <div className="absolute inset-x-4 bottom-6 rounded-lg border border-destructive/50 bg-card/95 p-3 text-xs sm:inset-x-8">
            <p className="text-destructive">{error}</p>
            <Button size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
              Coba lagi
            </Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border/60 bg-background/90 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
        {KEYS.map((key) => (
          <Button
            key={key.label}
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full bg-card/60 px-3 font-mono text-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => sendRef.current(key.seq)}
          >
            {key.label}
          </Button>
        ))}
      </div>
    </main>
  );
}
