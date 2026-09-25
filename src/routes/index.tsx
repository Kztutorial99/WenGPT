import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { bootChatStore, createSession, getSnapshot } from "@/lib/chat-store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "WenGPT — asisten AI dengan sandbox" },
    { name: "description", content: "Ngobrol, membuat file, dan menjalankan pekerjaan di sandbox Linux bersama WenGPT." },
    { property: "og:title", content: "WenGPT — asisten AI dengan sandbox" },
    { property: "og:description", content: "Ngobrol, membuat file, dan menjalankan pekerjaan di sandbox Linux bersama WenGPT." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Home,
});
function Home() {
  const navigate = useNavigate({ from: "/" });
  useEffect(() => {
    bootChatStore();
    const id = getSnapshot().activeId ?? createSession();
    navigate({ to: "/chat/$sessionId", params: { sessionId: id }, replace: true });
  }, [navigate]);
  return <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">Membuka sesi…</main>;
}
