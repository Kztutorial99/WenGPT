import { Link, useRouterState } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { FolderOpen, Home, MessagesSquare, Settings, SquareTerminal } from "lucide-react";
import { loadAllFiles } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";
import { cn } from "@/lib/utils";

function Badge({ value, dot }: { value: number; dot?: boolean }) {
  if (dot) {
    return (
      <span className="pointer-events-none absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-card" />
    );
  }
  if (!value) return null;
  return (
    <span className="pointer-events-none absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
      {value > 99 ? "99+" : value}
    </span>
  );
}

function Tab({
  to,
  params,
  label,
  icon: Icon,
  active,
  count,
  dot,
}: {
  to: string;
  params?: Record<string, string>;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  count: number;
  dot: boolean;
}) {
  return (
    <Link
      // Jalur dihitung dinamis dari daftar tab; cast hanya untuk melewati union rute ketat.
      to={to as "/"}
      params={params as never}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground",
        active && "bg-primary/15 text-primary shadow-[0_0_18px_-6px_var(--mark-glow)]",
      )}
    >
      <span className="relative inline-flex">
        <Icon className="size-4" />
        <Badge value={count} dot={dot} />
      </span>
      <span className="max-w-full truncate leading-none">{label}</span>
    </Link>
  );
}

export function AppNav({ sessionId }: { sessionId: string }) {
  const snapshot = useChatStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const filesNew =
    snapshot.ready && loadAllFiles().some((file) => file.updatedAt > snapshot.read.files);
  const sessionsNew = snapshot.sessions.filter(
    (session) => session.id !== sessionId && session.updatedAt > snapshot.read.history,
  ).length;
  const base = `/chat/${sessionId}`;
  return (
    <nav className="flex items-stretch justify-between gap-1 p-1.5" aria-label="Menu sesi">
      <Tab to="/chat/$sessionId" params={{ sessionId }} label="Beranda" icon={Home} active={pathname === base} count={0} dot={false} />
      <Tab to="/chat/$sessionId/files" params={{ sessionId }} label="File" icon={FolderOpen} active={pathname.startsWith(`${base}/files`)} count={0} dot={filesNew} />
      <Tab to="/chat/$sessionId/terminal" params={{ sessionId }} label="Tools" icon={SquareTerminal} active={pathname.startsWith(`${base}/terminal`)} count={0} dot={false} />
      <Tab to="/history" label="Chat" icon={MessagesSquare} active={pathname.startsWith("/history")} count={sessionsNew} dot={false} />
      <Tab to="/settings" label="Pengaturan" icon={Settings} active={pathname.startsWith("/settings")} count={0} dot={false} />
    </nav>
  );
}
