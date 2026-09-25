import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, FolderOpen, Terminal } from "lucide-react";
import { CopyButton } from "@/components/chat-code";
import { loadCheckpoints, type Checkpoint } from "@/lib/chat-store";

export const Route = createFileRoute("/linimasa")({
  head: () => ({
    meta: [
      { title: "Linimasa eksekusi — WenGPT" },
      { name: "description", content: "Langkah terminal dan file yang dijalankan WenGPT di sandbox, per checkpoint." },
      { property: "og:title", content: "Linimasa eksekusi — WenGPT" },
      { property: "og:description", content: "Langkah terminal dan file yang dijalankan WenGPT di sandbox, per checkpoint." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Timeline,
});

function Block({ label, text, tone = "" }: { label: string; text: string; tone?: string }) {
  return (
    <div className="mt-2 min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/60">
      <div className="flex items-center justify-between border-b border-border/50 px-2.5 py-0.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className={`max-h-60 overflow-auto px-2.5 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words ${tone}`}>{text}</pre>
    </div>
  );
}

function Timeline() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setCheckpoints(loadCheckpoints());
    refresh();
    window.addEventListener("storage", refresh);
    const t = window.setInterval(refresh, 1500);
    return () => { window.removeEventListener("storage", refresh); window.clearInterval(t); };
  }, []);

  // Default to the checkpoint that owns the linked run, otherwise the latest one.
  useEffect(() => {
    if (index !== null || checkpoints.length === 0) return;
    const hash = window.location.hash.slice(1);
    const found = hash ? checkpoints.findIndex((c) => c.runs.some((r) => r.id === hash)) : -1;
    setIndex(found >= 0 ? found : checkpoints.length - 1);
  }, [checkpoints, index]);

  const current = index !== null ? checkpoints[index] : undefined;
  const runs = current?.runs ?? [];
  const done = useMemo(() => runs.filter((r) => r.output).length, [runs]);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [index]);

  return (
    <main className="chat-shell h-dvh min-w-0 overflow-y-auto overscroll-contain bg-background text-foreground">
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Link to="/" className="grid size-8 place-items-center rounded-md border border-border/70 bg-card" aria-label="Kembali ke chat">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">Linimasa</h1>
          <p className="text-[11px] text-muted-foreground">
            {current ? `Checkpoint ${index! + 1} dari ${checkpoints.length} · ${done}/${runs.length} langkah` : "Belum ada eksekusi"}
          </p>
        </div>
        <Link to="/files" className="grid size-8 place-items-center rounded-md border border-border/70 bg-card" aria-label="File Manager">
          <FolderOpen className="size-4" />
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {!current ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Belum ada perintah yang dijalankan. Minta WenGPT menjalankan sesuatu di sandbox.</p>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2.5 shadow-panel backdrop-blur-xl">
              <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Checkpoint sebelumnya">
                <ChevronLeft className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">{index === checkpoints.length - 1 ? "Checkpoint terbaru" : "Checkpoint sebelumnya"}</p>
                <p className="truncate text-sm font-medium">{current.ask || "Permintaan"}</p>
              </div>
              <button type="button" disabled={index === checkpoints.length - 1} onClick={() => setIndex((i) => Math.min(checkpoints.length - 1, (i ?? 0) + 1))} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Checkpoint berikutnya">
                <ChevronRight className="size-4" />
              </button>
            </div>

            <ol className="relative ml-1 border-l border-border/70 pl-5">
              {runs.map((run, i) => {
                const o = run.output;
                const failed = !!o && ((typeof o.exitCode === "number" && o.exitCode !== 0) || o.ok === false);
                const cmd = run.name === "run_command";
                const input = cmd ? String(run.input.command ?? "") : String(run.input.path ?? "file");
                const out = o ? (cmd ? `${o.stdout ?? ""}${o.stderr ? `\n${o.stderr}` : ""}`.trim() : o.ok === false ? String(o.error ?? "Gagal") : "") : "";
                return (
                  <li key={run.id} id={run.id} className="mb-6 min-w-0 scroll-mt-24">
                    <span className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${!o ? "animate-pulse bg-muted-foreground" : failed ? "bg-destructive" : "bg-success"}`} />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{i + 1}.</span>
                      {cmd ? <Terminal className="size-3.5" /> : <FileText className="size-3.5" />}
                      <span>{cmd ? "Terminal" : "Tulis file"}</span>
                      <span>·</span>
                      <span className={failed ? "text-destructive" : o ? "text-success" : ""}>{!o ? "Berjalan…" : failed ? `Gagal${typeof o.exitCode === "number" ? ` (exit ${o.exitCode})` : ""}` : "Selesai"}</span>
                    </div>
                    {cmd ? (
                      <>
                        <Block label="Perintah" text={input} />
                        {o && <Block label="Hasil" text={out || "(tanpa output)"} tone={failed ? "text-destructive" : ""} />}
                      </>
                    ) : (
                      <Link to="/files" hash={input} className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-2 text-[12.5px] hover:border-primary/50">
                        <FileText className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate font-mono">{input}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">Buka di File</span>
                      </Link>
                    )}
                    {!cmd && failed && <Block label="Error" text={out} tone="text-destructive" />}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </main>
  );
}
