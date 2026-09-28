import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderOpen as Files,
  GitBranch,
  Brain,
  Terminal,
  Globe,
  Search,
} from "lucide-react";
import { CopyButton } from "@/components/chat-code";
import { Button } from "@/components/ui/button";
import { isWorkCheckpoint, loadCheckpoints, markTimelineRead, type Checkpoint, type TimelineEntry, type ToolRun } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";
import { AgentProgress } from "@/components/agent-progress";
export const Route = createFileRoute("/chat/$sessionId/timeline")({
  head: () => ({
    meta: [
      { title: "Linimasa eksekusi — WenGPT Prime" },
      {
        name: "description",
        content: "Proses berpikir, langkah, waktu, dan hasil pekerjaan WenGPT Prime untuk satu sesi.",
      },
      { property: "og:title", content: "Linimasa eksekusi — WenGPT Prime" },
      {
        property: "og:description",
        content: "Proses berpikir, langkah, waktu, dan hasil pekerjaan WenGPT Prime untuk satu sesi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Timeline,
});
function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function duration(run: ToolRun) {
  const ms =
    run.durationMs ??
    (run.finishedAt ? run.finishedAt - run.startedAt : Date.now() - run.startedAt);
  return ms < 1000 ? `${ms} md` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} dtk`;
}
function Block({ label, text, failed }: { label: string; text: string; failed?: boolean }) {
  return (
    <div className="mt-2 min-w-0 overflow-hidden rounded-md border border-border/65 bg-background/60">
      <div className="flex items-center justify-between border-b border-border/50 px-2.5 py-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre
        className={`max-h-52 overflow-auto px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap break-words ${failed ? "text-destructive" : ""}`}
      >
        {text}
      </pre>
    </div>
  );
}
function Timeline() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const [index, setIndex] = useState<number | null>(null);
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  const checkpoints = loadCheckpoints(sessionId).filter((checkpoint) => {
    const checkpointAgent = checkpoint.messageIds
      .map((id) => session?.messages.find((m) => m.id === id)?.agent)
      .filter(Boolean)
      .at(-1);
    return isWorkCheckpoint(checkpoint, checkpointAgent);
  });
  const streaming = snapshot.streamingIds.includes(sessionId);
  useEffect(() => {
    markTimelineRead(sessionId);
  }, [sessionId]);
  useEffect(() => {
    if (index === null && checkpoints.length) {
      const hash = window.location.hash.slice(1);
      const found = checkpoints.findIndex((c) => c.id === hash || c.entries.some((entry) => entry.id === hash));
      setIndex(found >= 0 ? found : checkpoints.length - 1);
    }
  }, [checkpoints.length, index, sessionId]);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const found = checkpoints.findIndex((c) => c.id === hash || c.entries.some((entry) => entry.id === hash));
    if (found >= 0) setIndex(found);
  }, [sessionId]);
  const current = index === null ? undefined : checkpoints[index];
  const runs = current?.runs ?? [];
  const entries = current?.entries ?? [];
  const done = useMemo(() => runs.filter((run) => run.output).length, [runs]);
  const active = streaming && current?.id === checkpoints.at(-1)?.id;
  const cancelled = current?.messageIds.some((id) => snapshot.sessions.find((s) => s.id === sessionId)?.messages.find((m) => m.id === id)?.parts.some((p) => p.type === "cancelled"));
  const agent = current?.messageIds
    .map((id) => session?.messages.find((m) => m.id === id)?.agent)
    .filter(Boolean)
    .at(-1);
  const agentDone = !!agent && (!!agent.done || ["COMPLETED", "FAILED", "ATTENTION"].includes(agent.state));
  const isActive = !!active && !agentDone;
  const failed = !!agent && agentDone && agent.done ? !agent.done.ok : false;
  const pending = !isActive && !agentDone && runs.some((run) => !run.output);
  return (
    <main className="h-dvh min-w-0 overflow-y-auto overscroll-contain bg-background text-foreground">
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-background/88 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Button asChild variant="outline" size="icon">
          <Link to="/chat/$sessionId" params={{ sessionId }}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">Linimasa</h1>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {current
              ? `${agent?.label ?? (isActive ? "Mengerjakan project" : failed ? "Perlu perhatian" : "Selesai")} · ${done}/${runs.length} aktivitas`
              : "Belum ada proses"}
          </p>
        </div>
        <Button asChild variant="outline" size="icon">
          <Link to="/chat/$sessionId/files" params={{ sessionId }}>
            <Files className="size-4" />
          </Link>
        </Button>
      </header>
      <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {!current ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
             Belum ada tugas kerja dalam sesi ini.
          </p>
        ) : (
          <>
            <CheckpointPicker
              current={current}
              index={index ?? 0}
              total={checkpoints.length}
              onChange={setIndex}
            />
            {agent && (
              <div className="mb-4">
                <AgentProgress agent={agent} sessionId={sessionId} active={isActive} />
              </div>
            )}
            <ol className="relative ml-1 border-l border-border/80 pl-5">
              {entries.map((entry, i) => (
                entry.type === "think" ? (
                  <ThinkingItem key={entry.id} entry={entry} number={i + 1} active={isActive && i === entries.length - 1} />
                ) : (
                  <RunItem key={entry.id} run={entry.run} number={i + 1} sessionId={sessionId} live={isActive} />
                )
              ))}
            </ol>
            <p role="status" className={`ml-6 flex items-center gap-2 border-l-2 py-1 pl-4 text-xs font-medium ${isActive || pending ? "border-warning text-muted-foreground" : failed ? "border-warning text-warning" : cancelled ? "border-destructive text-destructive" : "border-success text-success"}`}>
              {isActive || pending ? <span className="size-2 animate-pulse rounded-full bg-warning" /> : failed ? <CircleAlert className="size-4" /> : cancelled ? <CircleAlert className="size-4" /> : <Check className="size-4" />}
              {isActive ? "Sedang dikerjakan…" : pending ? "Ada langkah yang terhenti" : failed ? "Selesai dengan catatan" : cancelled ? "Proses dibatalkan" : "Linimasa selesai"}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
function CheckpointPicker({
  current,
  index,
  total,
  onChange,
}: {
  current: Checkpoint;
  index: number;
  total: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="mb-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2.5 shadow-panel">
      <Button
        variant="ghost"
        size="icon"
        disabled={index === 0}
        onClick={() => onChange(index - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock3 className="size-3.5" />
          <span>{formatTime(current.startedAt)}</span>
          <span>·</span>
          <span>{index === total - 1 ? "Terbaru" : `Proses ${index + 1}`}</span>
        </div>
        <p className="truncate text-sm font-medium">{current.ask}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        disabled={index === total - 1}
        onClick={() => onChange(index + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
function ThinkingItem({ entry, number, active }: { entry: Extract<TimelineEntry, { type: "think" }>; number: number; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li id={entry.id} className="mb-7 min-w-0 scroll-mt-24">
      <span className={`absolute -left-[6px] mt-1 size-3 rounded-full border-2 border-background ${active ? "animate-pulse bg-warning" : "bg-success"}`} />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="font-mono">{number}.</span>
        <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <Brain className="size-3.5" />
        <span>Proses berpikir</span>
        <span>·</span>
        {active ? (
          <span className="text-warning">Berjalan<span className="inline-block w-4 animate-pulse">...</span></span>
        ) : (
          <span className="text-success">Selesai</span>
        )}
        <span className="ml-auto">{formatTime(entry.at)}</span>
      </button>
      {expanded && (
        <div className="mt-2 min-w-0 rounded-md border border-border/65 bg-background/60 px-3 py-2.5 text-xs leading-5 whitespace-pre-wrap break-words text-muted-foreground">
          {entry.text.trim() || "Sedang berpikir…"}
        </div>
      )}
    </li>
  );
}
function WebItem({ run, number }: { run: ToolRun; number: number }) {
  const [expanded, setExpanded] = useState(false);
  const output = run.output;
  const search = run.name === "web_search";
  const failed = !!output && output.ok === false;
  return (
    <li id={run.id} className="mb-7 min-w-0 scroll-mt-24">
      <span className={`absolute -left-[6px] mt-1 size-3 rounded-full border-2 border-background ${!output ? "animate-pulse bg-warning" : failed ? "bg-destructive" : "bg-success"}`} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{number}.</span>
        <Globe className="size-3.5 text-primary" />
        <span>{search ? "Pencarian web" : "Baca halaman"}</span>
        <span>·</span>
        <span className={failed ? "text-destructive" : output ? "text-success" : "text-warning"}>
          {!output ? (search ? "Mencari…" : "Membaca…") : failed ? "Gagal" : search ? `${output.results?.length ?? 0} hasil` : "Selesai"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1"><Clock3 className="size-3" />{formatTime(run.startedAt)} · {duration(run)}</span>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border/65 bg-background/60 px-3 py-2 text-xs">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{search ? run.input.query : run.input.url}</span>
      </div>
      {search && !!output?.results?.length && (
         <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
           {output.results.slice(0, expanded ? undefined : 3).map((r) => (
             <li key={r.url} className="min-w-0">
               <a href={r.url} target="_blank" rel="noreferrer" className="block min-w-0 overflow-hidden rounded-md border border-border/50 bg-card/50 px-2.5 py-2 hover:border-primary/50">
                 <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                   <Globe className="size-3 shrink-0" />
                   <span className="min-w-0 truncate">{r.site}</span>
                </div>
                 <p className="mt-1 line-clamp-2 break-words text-xs font-medium leading-4">{r.title}</p>
                 <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{r.snippet}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
       {search && (output?.results?.length ?? 0) > 3 && (
         <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs text-muted-foreground" onClick={() => setExpanded((value) => !value)}>
           {expanded ? "Tampilkan lebih sedikit" : `Lihat ${((output?.results?.length ?? 0) - 3)} hasil lainnya`}
         </Button>
       )}
      {!search && output?.title && <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{output.title}</p>}
      {failed && output?.error && <p className="mt-1.5 text-[11px] text-destructive">{output.error}</p>}
    </li>
  );
}
function RunItem({ run, number, sessionId, live }: { run: ToolRun; number: number; sessionId: string; live: boolean }) {
  if (run.name === "web_search" || run.name === "read_webpage") return <WebItem run={run} number={number} />;
  const output = run.output;
  const failed = !!output && ((output.exitCode ?? 0) !== 0 || output.ok === false);
  const command = run.name === "run_command";
  const download = run.name === "download_file";
  const readF = run.name === "read_file";
  const editF = run.name === "edit_file";
  const listF = run.name === "list_files";
  const searchC = run.name === "search_code";
  const preview = run.name === "preview_app";
  const todoT = run.name === "todo";
  const itemLabel = readF ? "Baca file" : editF ? "Edit file" : listF ? "Lihat struktur" : searchC ? "Cari kode" : preview ? "Pratinjau aplikasi" : todoT ? "Checklist" : null;
  const out = output as (typeof output & { files?: { name?: string; path?: string }[] }) | undefined;
  const baseName = (v: unknown) => {
    const raw = (String(v ?? "").split("?")[0] ?? "").split("/").filter(Boolean).pop() ?? "";
    try { return decodeURIComponent(raw); } catch { return raw; }
  };
  const fileNames = download
    ? (out?.files ?? []).map((f) => f.name ?? baseName(f.path)).filter(Boolean)
    : [];
  const input = command
    ? String(run.input.command ?? "")
    : searchC
      ? String(run.input.query ?? "")
      : todoT
        ? ((run.input.items as { text?: string }[] | undefined) ?? []).map((i) => i.text).filter(Boolean).join(", ")
        : readF || editF || listF || preview
          ? String(run.input.path ?? run.input.port ?? output?.path ?? output?.url ?? "")
    : download
      ? fileNames.join(", ") || baseName(run.input.url) || String(run.input.url ?? "Menyiapkan unduhan…")
      : String(run.input.path ?? output?.path ?? "") || "Menyiapkan file…";
  const kindLabel = (() => {
    const n = (fileNames[0] ?? input).toLowerCase();
    if (/\.(mp4|webm|mkv|mov|avi)$/.test(n)) return "video";
    if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(n)) return "gambar";
    if (/\.(mp3|m4a|wav|ogg|opus|flac)$/.test(n)) return "audio";
    return "file";
  })();
  const stopped = !output && !live;
  const result = output
    ? command
      ? `${output.stdout ?? ""}${output.stderr ? `\n${output.stderr}` : ""}`.trim()
      : (output.error ?? "")
    : "";
  return (
    <li id={run.id} className="mb-7 min-w-0 scroll-mt-24">
      <span
        className={`absolute -left-[6px] mt-1 size-3 rounded-full border-2 border-background ${!output ? "animate-pulse bg-warning" : failed ? "bg-destructive" : "bg-success"}`}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{number}.</span>
        {command && <Terminal className="size-3.5" />}
        <span>{command ? "Terminal" : itemLabel ?? (download ? `Unduh ${kindLabel}` : `Tulis ${kindLabel}`)}</span>
        <span>·</span>
        <span className={failed || stopped ? "text-destructive" : output ? "text-success" : "text-warning"}>
          {stopped ? "Terhenti" : !output ? <>Berjalan<span className="inline-block w-4 animate-pulse">...</span></> : failed ? "Gagal" : "Selesai"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Clock3 className="size-3" />
          {formatTime(run.startedAt)} · {duration(run)}
        </span>
      </div>
      {command ? (
        <>
          <Block label="Perintah" text={input} />
          {output && (
            <Block
              label={failed ? "Error" : "Hasil"}
              text={result || "(tanpa output)"}
              failed={failed}
            />
          )}
        </>
      ) : (
        <p className="mt-1.5 min-w-0 truncate text-xs text-foreground/85">
          {(() => {
            const name = download ? (fileNames.join(", ") || input) : (input.split("/").pop() || input);
            if (!input || input === "Menyiapkan file…") return live && !output ? "Menyiapkan file…" : "File disiapkan";
            const doing = !output && live;
            const verb = download ? (doing ? "Mengunduh" : "Diunduh:") : readF ? (doing ? "Membaca" : "Dibaca:") : editF ? (doing ? "Mengubah" : "Diubah:") : listF ? (doing ? "Melihat" : "Dilihat:") : searchC ? (doing ? "Mencari" : "Dicari:") : preview ? (doing ? "Menyiapkan pratinjau" : "Pratinjau:") : todoT ? "" : (doing ? "Menulis" : "Disimpan:");
            return `${verb} ${name}`.trim();
          })()}
          {(failed || stopped) && <span className="ml-1 text-destructive">· gagal</span>}
        </p>
      )}
    </li>
  );
}
