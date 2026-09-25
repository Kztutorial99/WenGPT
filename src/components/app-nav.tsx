import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FolderOpen, GitBranch, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAllFiles, loadCheckpoints } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="pointer-events-none absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums">{count > 99 ? "99+" : count}</span>;
}
function Item({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <span className="relative inline-flex"><Button asChild variant="ghost" size="icon" title={title} aria-label={`${title}${count ? ` (${count})` : ""}`}>{children}</Button><Badge count={count} /></span>;
}
export function AppNav({ sessionId }: { sessionId: string }) {
  const snapshot = useChatStore();
  const files = snapshot.ready ? loadAllFiles().length : 0;
  const steps = snapshot.ready ? loadCheckpoints(sessionId).length : 0;
  const sessions = snapshot.sessions.length;
  return <nav className="flex shrink-0 items-center gap-1" aria-label="Menu sesi">
    <Item title="File Manager" count={files}><Link to="/chat/$sessionId/files" params={{ sessionId }}><FolderOpen className="size-4" /></Link></Item>
    <Item title="Linimasa" count={steps}><Link to="/chat/$sessionId/timeline" params={{ sessionId }}><GitBranch className="size-4" /></Link></Item>
    <Item title="Riwayat sesi" count={sessions}><Link to="/history"><MessagesSquare className="size-4" /></Link></Item>
  </nav>;
}
