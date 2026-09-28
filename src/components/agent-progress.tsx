import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  RotateCcw,
  WifiOff,
  X,
} from "lucide-react";
import type { AgentFileChange, AgentMilestone, AgentState } from "@/lib/chat-store";
import { FileIcon } from "@/components/file-icon";
import { Button } from "@/components/ui/button";

const MARK: Record<AgentMilestone["status"], { icon: typeof Check; cls: string; label: string }> = {
  done: { icon: Check, cls: "text-success", label: "Selesai" },
  running: { icon: Loader2, cls: "text-warning animate-spin", label: "Berjalan" },
  pending: { icon: Circle, cls: "text-muted-foreground", label: "Belum" },
  attention: { icon: AlertTriangle, cls: "text-warning", label: "Perlu perhatian" },
  failed: { icon: X, cls: "text-destructive", label: "Gagal" },
};

const STATE_LABEL: Record<string, string> = {
  RECEIVED: "Menerima permintaan",
  UNDERSTANDING: "Memahami kebutuhan",
  WAITING_FOR_CLARIFICATION: "Menunggu jawaban Anda",
  PLANNING: "Merencanakan",
  EXECUTING: "Mengerjakan project",
  TESTING: "Menguji aplikasi",
  FIXING: "Memperbaiki error",
  PREVIEWING: "Menyiapkan pratinjau",
  COMPLETED: "Selesai",
  ATTENTION: "Perlu perhatian",
  FAILED: "Pekerjaan berhenti karena error",
  PAUSED: "Dijeda",
  DISCONNECTED: "Koneksi terputus — pekerjaan tetap tersimpan",
};

const range = (f: AgentFileChange) => {
  const r = f.ranges[0];
  if (!r) return "";
  return r[1] > r[0] ? `L${r[0]}–${r[1]}` : `L${r[0]}`;
};

const friendlyDetail = (detail: string) => {
  const trimmed = detail.trim();
  if (!trimmed) return "";
  const file = trimmed.match(/(?:^|\s)(?:\/home\/user\/)?([\w./-]+\.[A-Za-z0-9]+)(?:\s|$)/)?.[1];
  if (/\b(g\+\+|gcc|clang|make|cmake|javac|rustc|cargo|go\s+(?:build|test)|npm\s+(?:run\s+)?(?:build|test)|pytest|tsc)\b/i.test(trimmed))
    return file ? `Menguji ${file.split("/").pop()}` : "Menjalankan pengujian";
  if (/\b(mkdir|install|npm\s+(?:i|install|add)|bun\s+(?:i|install|add)|pip\s+install)\b/i.test(trimmed))
    return file ? `Menyiapkan ${file.split("/").pop()}` : "Menyiapkan project";
  if (/\b(cat\s+>|tee|touch|sed\s+-i|cp\s|mv\s)\b/i.test(trimmed))
    return file ? `Mengubah ${file.split("/").pop()}` : "Memperbarui file project";
  if (trimmed.startsWith("/home/user/")) return `Mengerjakan ${trimmed.split("/").pop()}`;
  if (/\s|&&|\|/.test(trimmed)) return "Menjalankan langkah kerja";
  return trimmed;
};

/** Link ke File Manager: buka file & sorot baris. */
export function fileLinkHash(path: string, line?: number) {
  return `${path}${line ? `:${line}` : ""}`;
}

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-4">
      {diff.split("\n").map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith("+")
              ? "text-success"
              : l.startsWith("-")
                ? "text-destructive"
                : "text-muted-foreground"
          }
        >
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

/** Progres kerja agent: tahap besar, baris aktif, file yang berubah (dengan baris & diff), status selesai jujur. */
export function AgentProgress({
  agent,
  sessionId,
  active,
  onResume,
}: {
  agent: AgentState;
  sessionId: string;
  active: boolean;
  onResume?: (() => void) | undefined;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [, tick] = useState(0);
  const terminal = ["COMPLETED", "FAILED", "ATTENTION"].includes(agent.state) || !!agent.done;
  const live = active && !terminal && agent.state !== "DISCONNECTED";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, [live]);
  const hasContent =
    agent.milestones.length > 0 ||
    agent.files.length > 0 ||
    agent.state === "DISCONNECTED" ||
    agent.state === "WAITING_FOR_CLARIFICATION" ||
    (agent.done && !agent.done.ok);
  if (!hasContent && !active) return null;
  const state = agent.state;
  const label =
    state === "DISCONNECTED"
      ? (agent.label ?? STATE_LABEL[state])
      : (STATE_LABEL[state] ?? agent.label ?? state);
  const quiet = live && Date.now() - (agent.lastEventAt ?? agent.lastBeat ?? Date.now()) > 6_000;
  const beatAlive = !agent.lastBeat || Date.now() - agent.lastBeat < 15_000;
  const stalled = quiet && beatAlive;
  const latestByPath = [...new Map(agent.files.map((f) => [f.path, f])).values()];

  return (
    <div
      className="mb-2 rounded-md border border-border/70 bg-card/55 px-3 py-2 text-xs"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {state === "DISCONNECTED" ? (
          <WifiOff className="size-3.5 text-warning" />
        ) : state === "COMPLETED" ? (
          <Check className="size-3.5 text-success" />
        ) : state === "FAILED" ? (
          <X className="size-3.5 text-destructive" />
        ) : state === "ATTENTION" ? (
          <AlertTriangle className="size-3.5 text-warning" />
        ) : live ? (
          <Loader2 className="size-3.5 animate-spin text-warning" />
        ) : (
          <Circle className="size-3.5 text-muted-foreground" />
        )}
        <span className="font-medium">{label}</span>
        {stalled && <span className="text-muted-foreground">· masih bekerja…</span>}
      </div>
      {live && agent.detail && (
        <p className="mt-0.5 truncate pl-5 text-muted-foreground">{friendlyDetail(agent.detail)}</p>
      )}

      {agent.milestones.length > 0 && (
        <ol className="mt-2 space-y-1 pl-1">
          {agent.milestones.map((m) => {
            const mark = MARK[!live && m.status === "running" ? (terminal && agent.done?.ok ? "done" : "attention") : m.status];
            const Icon = mark.icon;
            return (
              <li key={m.id} className="flex items-start gap-2">
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${mark.cls}`} aria-label={mark.label} />
                <span className="min-w-0">
                  <span className={m.status === "pending" ? "text-muted-foreground" : ""}>
                    {m.title}
                  </span>
                  {m.detail && (
                    <span className="block truncate text-muted-foreground">{m.detail}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {latestByPath.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => setShowFiles((v) => !v)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {showFiles ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {latestByPath.length} file berubah
          </button>
          {showFiles && (
            <ul className="mt-1 space-y-1">
              {agent.files
                .slice()
                .reverse()
                .map((f) => (
                  <li key={f.opId}>
                    <div className="flex items-center gap-2">
                      <FileIcon path={f.path} className="size-3.5" />
                      <Link
                        to="/chat/$sessionId/files"
                        params={{ sessionId }}
                        hash={fileLinkHash(f.path, f.ranges[0]?.[0])}
                        className="min-w-0 truncate font-mono hover:underline"
                      >
                        {f.path.replace(/^\/home\/user\//, "")}
                      </Link>
                      <span className="shrink-0 text-muted-foreground">· {range(f)}</span>
                      <span className="shrink-0 text-success">+{f.added}</span>
                      <span className="shrink-0 text-destructive">−{f.removed}</span>
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setOpenDiff((v) => (v === f.opId ? null : f.opId))}
                      >
                        {openDiff === f.opId ? "Tutup" : "Diff"}
                      </button>
                    </div>
                    {openDiff === f.opId && <DiffBlock diff={f.diff} />}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {agent.done && !agent.done.ok && agent.done.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-border/50 pt-2 text-warning">
          {agent.done.reasons.map((r) => (
            <li key={r}>⚠ {r}</li>
          ))}
        </ul>
      )}

      {state === "DISCONNECTED" && !active && onResume && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResume}
          className="mt-2 h-7 gap-1.5 rounded-full px-3 text-xs"
        >
          <RotateCcw className="size-3" />
          Lanjutkan dari checkpoint
        </Button>
      )}
    </div>
  );
}
