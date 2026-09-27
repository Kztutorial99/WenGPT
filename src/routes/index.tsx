import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { bootChatStore, createSession, getSnapshot } from "@/lib/chat-store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "WenGPT Prime — asisten AI dengan sandbox" },
    { name: "description", content: "Ngobrol, membuat file, dan menjalankan pekerjaan di sandbox Linux bersama WenGPT Prime." },
    { property: "og:title", content: "WenGPT Prime — asisten AI dengan sandbox" },
    { property: "og:description", content: "Ngobrol, membuat file, dan menjalankan pekerjaan di sandbox Linux bersama WenGPT Prime." },
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
