import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FolderOpen, GitBranch, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAllFiles, loadCheckpoints } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";

function Status({ value, dot }: { value: number; dot?: boolean }) {
  if (!value) return null;
  return dot ? (
    <span className="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
  ) : (
    <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums">
      {value > 99 ? "99+" : value}
    </span>
  );
}
function Item({
  title,
  status,
  dot,
  children,
}: {
  title: string;
  status: number;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex">
      <Button
        asChild
        variant="ghost"
        size="icon"
        title={title}
        aria-label={`${title}${status ? " — ada yang baru" : ""}`}
      >
        {children}
      </Button>
      <Status value={status} {...(dot === undefined ? {} : { dot })} />
    </span>
  );
}
export function AppNav({ sessionId }: { sessionId: string }) {
  const snapshot = useChatStore();
  const files =
    snapshot.ready && loadAllFiles().some((file) => file.updatedAt > snapshot.read.files) ? 1 : 0;
  const steps =
    snapshot.ready &&
    loadCheckpoints(sessionId).some((checkpoint) =>
      checkpoint.runs.some(
        (run) => (run.finishedAt ?? run.startedAt) > (snapshot.read.timelines[sessionId] ?? 0),
      ),
    )
      ? 1
      : 0;
  const sessions = snapshot.sessions.filter(
    (session) => session.id !== sessionId && session.updatedAt > snapshot.read.history,
  ).length;
  return (
    <nav className="flex shrink-0 items-center gap-1" aria-label="Menu sesi">
      <Item title="File Manager" status={files} dot>
        <Link to="/chat/$sessionId/files" params={{ sessionId }}>
          <FolderOpen className="size-4" />
        </Link>
      </Item>
      <Item title="Linimasa" status={steps} dot>
        <Link to="/chat/$sessionId/timeline" params={{ sessionId }}>
          <GitBranch className="size-4" />
        </Link>
      </Item>
      <Item title="Riwayat sesi" status={sessions}>
        <Link to="/history">
          <MessagesSquare className="size-4" />
        </Link>
      </Item>
    </nav>
  );
}
