import { Link } from "@tanstack/react-router";
import { Files, GitBranch, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
export function AppNav({ sessionId }: { sessionId: string }) {
  return <nav className="flex shrink-0 items-center gap-1" aria-label="Menu sesi">
    <Button asChild variant="ghost" size="icon" title="File Manager"><Link to="/chat/$sessionId/files" params={{ sessionId }}><Files className="size-4" /></Link></Button>
    <Button asChild variant="ghost" size="icon" title="Linimasa"><Link to="/chat/$sessionId/timeline" params={{ sessionId }}><GitBranch className="size-4" /></Link></Button>
    <Button asChild variant="ghost" size="icon" title="Riwayat sesi"><Link to="/history"><MessagesSquare className="size-4" /></Link></Button>
  </nav>;
}
