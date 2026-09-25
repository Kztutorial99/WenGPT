import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, FolderOpen, History, X } from "lucide-react";
import { CopyButton } from "@/components/chat-code";
import { loadFiles, normalizePath, type SavedFile } from "@/lib/chat-store";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "File Manager — WenGPT" },
      { name: "description", content: "Semua file yang dibuat WenGPT untukmu, siap dilihat, disalin, dan diunduh." },
      { property: "og:title", content: "File Manager — WenGPT" },
      { property: "og:description", content: "Semua file yang dibuat WenGPT untukmu, siap dilihat, disalin, dan diunduh." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Files,
});

const short = (p: string) => p.replace(/^\/home\/user\//, "");
const name = (p: string) => p.split("/").pop() || p;

function download(f: SavedFile) {
  const url = URL.createObjectURL(new Blob([f.content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name(f.path);
  a.click();
  URL.revokeObjectURL(url);
}

function Files() {
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setFiles(loadFiles());
    refresh();
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) setOpen(normalizePath(hash));
    window.addEventListener("storage", refresh);
    const t = window.setInterval(refresh, 1500);
    return () => { window.removeEventListener("storage", refresh); window.clearInterval(t); };
  }, []);

  const active = files.find((f) => f.path === open);

  return (
    <main className="chat-shell h-dvh min-w-0 overflow-y-auto overscroll-contain bg-background text-foreground">
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Link to="/" className="grid size-8 place-items-center rounded-md border border-border/70 bg-card" aria-label="Kembali ke chat">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">File Manager</h1>
          <p className="text-[11px] text-muted-foreground">{files.length} file dibuat WenGPT</p>
        </div>
        <Link to="/linimasa" className="grid size-8 place-items-center rounded-md border border-border/70 bg-card" aria-label="Linimasa">
          <History className="size-4" />
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {files.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <FolderOpen className="mb-3 size-8 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">Belum ada file. Minta WenGPT membuatkan file, misalnya “buat script hello.py”.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/55 shadow-panel backdrop-blur-xl">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => setOpen(f.path)} className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/60 bg-background/60">
                    <FileText className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name(f.path)}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{short(f.path)} · {f.content.length} karakter</span>
                  </span>
                  {f.failed && <span className="shrink-0 text-[11px] text-destructive">Gagal</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {active && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-xl" role="dialog" aria-label={name(active.path)}>
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name(active.path)}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{active.path}</p>
            </div>
            <div className="flex items-center gap-1">
              <CopyButton text={active.content} />
              <button type="button" onClick={() => download(active)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Unduh file">
                <Download className="size-4" />
              </button>
              <button type="button" onClick={() => { setOpen(null); history.replaceState(null, "", "/files"); }} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Tutup">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] font-mono text-[12.5px] leading-5 whitespace-pre-wrap break-words">{active.content || "(file kosong)"}</pre>
        </div>
      )}
    </main>
  );
}
