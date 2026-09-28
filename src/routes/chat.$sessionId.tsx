import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useChatStore } from "@/lib/use-chat-store";
import { useViewportBox } from "@/lib/viewport";

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatLayout,
});

function ChatLayout() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  const mode = session?.mode ?? "prime";
  const box = useViewportBox();

  return (
    <div
      style={box}
      data-mode={mode}
      className="chat-shell cyber-grid fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground"
    >
      <Outlet />
    </div>
  );
}
