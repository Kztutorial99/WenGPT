import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Terminal } from "lucide-react";
import { CopyButton } from "@/components/chat-code";

export const Route = createFileRoute("/linimasa")({
  head: () => ({
    meta: [
      { title: "Linimasa eksekusi — WenGPT" },
      { name: "description", content: "Riwayat perintah terminal dan file yang dijalankan WenGPT di sandbox." },
      { property: "og:title", content: "Linimasa eksekusi — WenGPT" },
      { property: "og:description", content: "Riwayat perintah terminal dan file yang dijalankan WenGPT di sandbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Timeline,
});

type ToolOut = { exitCode?: number; stdout?: string; stderr?: string; ok?: boolean; error?: string };
type Run = { id: string; name: string; input: { command?: string; path?: string; content?: string }; output?: ToolOut };
type Item = { run: Run; ask: string };

function load(): Item[] {
  try {
    const saved = JSON.parse(localStorage.getItem("wengpt:chat") || "{}");
    const items: Item[] = [];
    let ask = "";
    for (const m of saved.messages ?? []) {
      for (const p of m.parts ?? []) {
        if (m.role === "user" && p.type === "text") ask = p.text;
        if (p.type === "tool") items.push({ run: p.run, ask });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function Block({ label, text, tone = "" }: { label: string; text: string; tone?: string }) {
  return (
    <div className="mt-2 min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/60">
      <div className="flex items-center justify-between border-b border-border/50 px-2.5 py-0.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className={`max-h-72 overflow-auto px-2.5 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words ${tone}`}>{text}</pre>
    </div>
  );
}

function Timeline() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const refresh = () => setItems(load());
    refresh();
    window.addEventListener("storage", refresh);
    const t = window.setInterval(refresh, 1500);
    return () => { window.removeEventListener("storage", refresh); window.clearInterval(t); };
  }, []);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [items.length]);

  return (
    <main className="chat-shell min-h-dvh min-w-0 bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/50 bg-background/75 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Link to="/" className="grid size-8 place-items-center rounded-md border border-border/70 bg-card" aria-label="Kembali ke chat">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">Linimasa</h1>
          <p className="text-[11px] text-muted-foreground">{items.length} eksekusi di sandbox</p>
        </div>
      </header>
      <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {items.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Belum ada perintah yang dijalankan. Minta WenGPT menjalankan sesuatu di sandbox.</p>
        ) : (
          <ol className="relative border-l border-border/70 pl-5">
            {items.map(({ run, ask }) => {
              const o = run.output;
              const failed = !!o && ((typeof o.exitCode === "number" && o.exitCode !== 0) || o.ok === false);
              const cmd = run.name === "run_command";
              const input = cmd ? String(run.input.command ?? "") : String(run.input.path ?? "file");
              const out = o ? (cmd ? `${o.stdout ?? ""}${o.stderr ? `\n${o.stderr}` : ""}`.trim() : JSON.stringify(o, null, 2)) : "";
              return (
                <li key={run.id} id={run.id} className="mb-6 min-w-0 scroll-mt-20">
                  <span className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${!o ? "bg-muted-foreground animate-pulse" : failed ? "bg-destructive" : "bg-success"}`} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {cmd ? <Terminal className="size-3.5" /> : <FileText className="size-3.5" />}
                    <span>{cmd ? "Terminal" : "Tulis file"}</span>
                    <span>·</span>
                    <span className={failed ? "text-destructive" : o ? "text-success" : ""}>{!o ? "Berjalan…" : failed ? `Gagal${typeof o.exitCode === "number" ? ` (exit ${o.exitCode})` : ""}` : "Selesai"}</span>
                  </div>
                  {ask && <p className="mt-1 truncate text-[12px] text-muted-foreground">“{ask}”</p>}
                  <Block label={cmd ? "Perintah" : "File"} text={input} />
                  {!cmd && run.input.content && <Block label="Isi" text={String(run.input.content)} />}
                  {o && <Block label="Hasil" text={out || "(tanpa output)"} tone={failed ? "text-destructive" : ""} />}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
