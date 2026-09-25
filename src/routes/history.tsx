import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSession, deleteSession, markHistoryRead } from "@/lib/chat-store";
import { useEffect } from "react";
import { useChatStore } from "@/lib/use-chat-store";
export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Riwayat sesi — WenGPT" },
      {
        name: "description",
        content: "Buka, buat, atau hapus sesi percakapan WenGPT yang tersimpan di browser ini.",
      },
      { property: "og:title", content: "Riwayat sesi — WenGPT" },
      {
        property: "og:description",
        content: "Buka, buat, atau hapus sesi percakapan WenGPT yang tersimpan di browser ini.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});
function HistoryPage() {
  const snapshot = useChatStore();
  const navigate = useNavigate({ from: "/history" });
  useEffect(() => {
    markHistoryRead();
  }, []);
  const sorted = [...snapshot.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const make = () => {
    const id = createSession();
    navigate({ to: "/chat/$sessionId", params: { sessionId: id } });
  };
  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/88 px-4 py-3 backdrop-blur-xl">
        <Button asChild variant="outline" size="icon">
          {snapshot.activeId ? (
            <Link to="/chat/$sessionId" params={{ sessionId: snapshot.activeId }}>
              <ArrowLeft className="size-4" />
            </Link>
          ) : (
            <Link to="/">
              <ArrowLeft className="size-4" />
            </Link>
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold">Riwayat sesi</h1>
          <p className="text-[11px] text-muted-foreground">{sorted.length} sesi di browser ini</p>
        </div>
        <Button size="sm" onClick={make}>
          <Plus className="size-4" /> Baru
        </Button>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-5">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
          {sorted.map((session) => (
            <div
              key={session.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border/50 last:border-0"
            >
              <Link
                to="/chat/$sessionId"
                params={{ sessionId: session.id }}
                className="flex min-w-0 items-center gap-3 px-3 py-3.5 active:bg-muted"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                  <MessageSquare className="size-4 text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{session.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {session.messages.length} pesan
                  </span>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 text-muted-foreground hover:text-destructive"
                title="Hapus sesi"
                onClick={() => {
                  const next = deleteSession(session.id);
                  if (!next) make();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
