import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  FolderOpen as Files,
  GitBranch,
  Terminal,
} from "lucide-react";
import { CopyButton } from "@/components/chat-code";
import { Button } from "@/components/ui/button";
import { loadCheckpoints, markTimelineRead, type Checkpoint, type ToolRun } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";
export const Route = createFileRoute("/chat/$sessionId/timeline")({
  head: () => ({
    meta: [
      { title: "Linimasa eksekusi — WenGPT" },
      {
        name: "description",
        content: "Langkah, waktu, durasi, dan hasil pekerjaan WenGPT untuk satu sesi.",
      },
      { property: "og:title", content: "Linimasa eksekusi — WenGPT" },
      {
        property: "og:description",
        content: "Langkah, waktu, durasi, dan hasil pekerjaan WenGPT untuk satu sesi.",
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
  useChatStore();
  const [index, setIndex] = useState<number | null>(null);
  const checkpoints = loadCheckpoints(sessionId);
  useEffect(() => {
    markTimelineRead(sessionId);
  }, [sessionId]);
  useEffect(() => {
    if (index === null && checkpoints.length) {
      const hash = window.location.hash.slice(1);
      const found = checkpoints.findIndex((c) => c.runs.some((r) => r.id === hash));
      setIndex(found >= 0 ? found : checkpoints.length - 1);
    }
  }, [checkpoints, index]);
  const current = index === null ? undefined : checkpoints[index];
  const runs = current?.runs ?? [];
  const done = useMemo(() => runs.filter((run) => run.output).length, [runs]);
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
              ? `Checkpoint ${(index ?? 0) + 1} dari ${checkpoints.length} · ${done}/${runs.length} langkah`
              : "Belum ada eksekusi"}
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
            Belum ada langkah. Minta WenGPT menjalankan pekerjaan di sandbox.
          </p>
        ) : (
          <>
            <CheckpointPicker
              current={current}
              index={index ?? 0}
              total={checkpoints.length}
              onChange={setIndex}
            />
            <ol className="relative ml-1 border-l border-border/80 pl-5">
              {runs.map((run, i) => (
                <RunItem key={run.id} run={run} number={i + 1} sessionId={sessionId} />
              ))}
            </ol>
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
          <span>{index === total - 1 ? "Terbaru" : `Checkpoint ${index + 1}`}</span>
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
function RunItem({ run, number, sessionId }: { run: ToolRun; number: number; sessionId: string }) {
  const output = run.output;
  const failed = !!output && ((output.exitCode ?? 0) !== 0 || output.ok === false);
  const command = run.name === "run_command";
  const input = command ? String(run.input.command ?? "") : String(run.input.path ?? "file");
  const result = output
    ? command
      ? `${output.stdout ?? ""}${output.stderr ? `\n${output.stderr}` : ""}`.trim()
      : (output.error ?? "")
    : "";
  return (
    <li id={run.id} className="mb-7 min-w-0 scroll-mt-24">
      <span
        className={`absolute -left-[6px] mt-1 size-3 rounded-full border-2 border-background ${!output ? "animate-pulse bg-muted-foreground" : failed ? "bg-destructive" : "bg-success"}`}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{number}.</span>
        {command ? <Terminal className="size-3.5" /> : <FileText className="size-3.5" />}
        <span>{command ? "Terminal" : "Tulis file"}</span>
        <span>·</span>
        <span className={failed ? "text-destructive" : output ? "text-success" : ""}>
          {!output ? "Berjalan…" : failed ? "Gagal" : "Selesai"}
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
        <Link
          to="/chat/$sessionId/files"
          params={{ sessionId }}
          hash={input}
          className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border/65 bg-background/60 px-3 py-2.5 active:bg-muted"
        >
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{input}</span>
          {failed ? (
            <CircleAlert className="size-4 text-destructive" />
          ) : (
            <Check className="size-4 text-success" />
          )}
        </Link>
      )}
    </li>
  );
}
