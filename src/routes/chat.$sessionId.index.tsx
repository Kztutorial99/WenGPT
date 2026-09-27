import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Globe, ChevronRight, FileText, GitBranch, Image as ImageIcon, Paperclip, Plus, Video, X } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { AiDots, requestedSecrets, SecretSlider } from "@/components/secret-cards";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationScrollOnComplete,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  createSession,
  loadCheckpoints,
  sendMessage,
  setActiveSession,
  stopSession,
  type ToolRun,
  type WebResult,
} from "@/lib/chat-store";
import { applySecretResults } from "@/lib/chat-store";
import { useChatStore } from "@/lib/use-chat-store";
import { useViewportBox } from "@/lib/viewport";

export const Route = createFileRoute("/chat/$sessionId/")({
  head: () => ({
    meta: [
      { title: "Chat — WenGPT" },
      { name: "description", content: "Sesi percakapan WenGPT dengan terminal dan File Manager." },
      { property: "og:title", content: "Chat — WenGPT" },
      {
        property: "og:description",
        content: "Sesi percakapan WenGPT dengan terminal dan File Manager.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});
const STARTERS = [
  "Kamu bisa bantu apa saja?",
  "Install pandas lalu hitung rata-rata 10 angka acak",
  "Cek versi Python dan Node di sandbox",
  "Buatkan script Python sederhana",
];
function AttachmentHeader() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputHeader className={attachments.files.length ? "px-3 pt-2" : "hidden"}>
      {attachments.files.map((file) => (
        <span
          key={file.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/70 px-2 py-1 text-[11px]"
        >
          <FileText className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-48 truncate">{file.filename ?? "file"}</span>
          <PromptInputButton
            className="size-5"
            aria-label={`Hapus ${file.filename ?? "file"}`}
            onClick={() => attachments.remove(file.id)}
          >
            <X className="size-3" />
          </PromptInputButton>
        </span>
      ))}
    </PromptInputHeader>
  );
}
function AttachmentButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputTools>
      <PromptInputButton
        aria-label="Lampirkan file"
        className="size-8 rounded-full bg-muted text-foreground hover:bg-accent"
        onClick={() => attachments.openFileDialog()}
      >
        <Paperclip className="size-4" />
      </PromptInputButton>
    </PromptInputTools>
  );
}
function WebSources({ sources }: { sources: WebResult[] }) {
  return (
    <div className="mt-3 min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Globe className="size-3.5 text-primary" />
        Sumber web · {sources.length}
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {sources.map((s, i) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="w-52 shrink-0 snap-start rounded-lg border border-border/70 bg-card/60 p-2.5 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <img src={`https://www.google.com/s2/favicons?domain=${s.site}&sz=32`} alt="" className="size-3.5 rounded-sm" loading="lazy" />
              <span className="truncate">{s.site}</span>
              <span className="ml-auto font-mono">{i + 1}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-4">{s.title}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
function Chat() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const session = snapshot.sessions.find((item) => item.id === sessionId);
  const [input, setInput] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dismissedSecrets, setDismissedSecrets] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setDismissedSecrets(new Set(JSON.parse(localStorage.getItem("wengpt-secret-done") ?? "[]") as string[]));
    } catch {
      /* abaikan */
    }
  }, []);
  const dismissSecrets = (ids: string[]) =>
    setDismissedSecrets((prev) => {
      const next = new Set([...prev, ...ids]);
      localStorage.setItem("wengpt-secret-done", JSON.stringify([...next].slice(-200)));
      return next;
    });
  const box = useViewportBox();
  const streaming = snapshot.streamingIds.includes(sessionId);
  const last = session?.messages.at(-1);
  const checkpoints = loadCheckpoints(sessionId);
  // Form secret terbaru yang masih menunggu diisi, ditampilkan sebagai panel di atas kotak pesan.
  const lastAssistant = session?.messages.filter((m) => m.role === "assistant").at(-1);
  const secretRuns = streaming
    ? []
    : (lastAssistant?.parts ?? [])
        .filter((part): part is { type: "tool"; run: ToolRun } => part.type === "tool" && part.run.name === "request_secret")
        .map((part) => part.run)
        .filter((run) => !dismissedSecrets.has(run.id));
  const secretItems = requestedSecrets(secretRuns);
  useEffect(() => {
    if (snapshot.ready && !session) {
      const id = createSession();
      window.location.replace(`/chat/${id}`);
    } else if (session) setActiveSession(sessionId);
  }, [snapshot.ready, session, sessionId]);
  const submit = (text: string, files: PromptInputMessage["files"] = []) => {
    const value = text.trim();
    if (!value && !files.length) return;
    setInput("");
    setUploadError("");
    void sendMessage(sessionId, value, files).catch((error: unknown) =>
      setUploadError(error instanceof Error ? error.message : "File gagal dilampirkan."),
    );
  };
  return (
    <main
      style={box}
      className="chat-shell fixed inset-x-0 top-0 flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 bg-background/86 px-3 py-2.5 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="brand-mark">
            <Bot className="size-4" />
          </span>
          <h1 className="truncate text-sm font-semibold">WenGPT</h1>
        </div>
        <div className="flex items-center">
          <AppNav sessionId={sessionId} />
          <Button
            variant="ghost"
            size="icon"
            title="Sesi baru"
            onClick={() => {
              const id = createSession();
              window.location.assign(`/chat/${id}`);
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </header>
      <Conversation className="min-h-0 min-w-0">
        <ConversationScrollOnComplete streaming={streaming} />
        <ConversationContent className="mx-auto min-h-full w-full min-w-0 max-w-3xl gap-7 px-3 py-6 sm:px-6 sm:py-8">
          {!session?.messages.length ? (
            <section className="flex min-h-[62dvh] flex-col items-center justify-center text-center">
              <span className="brand-mark mb-5 size-12">
                <Bot className="size-5" />
              </span>
              <h2 className="text-balance text-2xl font-semibold sm:text-3xl">
                Mau mengerjakan apa hari ini?
              </h2>
              <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-muted-foreground">
                Ngobrol, membuat file, atau menjalankan pekerjaan langsung di sandbox sesi ini.
              </p>
              <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    variant="outline"
                    onClick={() => submit(starter)}
                    className="h-auto min-w-0 justify-start whitespace-normal bg-card/45 px-3 py-3 text-left text-sm leading-5"
                  >
                    {starter}
                  </Button>
                ))}
              </div>
            </section>
          ) : (
            session.messages.map((message) => {
              const checkpoint = message.role === "assistant"
                ? checkpoints.find((item) => item.messageIds.includes(message.id))
                : undefined;
              const active = streaming && message.id === last?.id;
              const runs = checkpoint?.runs ?? [];
              const complete = runs.filter((run) => !!run.output).length;
              const currentRun = runs.find((run) => !run.output);
              const lastToolIndex = message.parts.reduce((lastIndex, part, index) => part.type === "tool" ? index : lastIndex, -1);
              const sources = message.parts
                .flatMap((part) => (part.type === "tool" && part.run.name === "web_search" ? (part.run.output?.results ?? []) : []))
                .filter((r, i, all) => all.findIndex((x) => x.url === r.url) === i)
                .slice(0, 6);
              const progress = currentRun?.name === "web_search"
                ? "Mencari di web"
                : currentRun?.name === "read_webpage"
                  ? "Membaca halaman web"
                  : currentRun?.name === "run_command"
                ? "Menjalankan perintah"
                : currentRun?.name === "write_file"
                  ? "Menulis file"
                  : currentRun ? "Sedang memproses" : active ? "Sedang berpikir" : "Proses selesai";
              return (
              <Message key={message.id} from={message.role} className="min-w-0 max-w-full">
                {message.role === "assistant" && (
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="brand-mark size-6 rounded-sm">
                      <Bot className="size-3.5" />
                    </span>
                    WenGPT
                  </div>
                )}
                <MessageContent
                  className={
                    message.role === "user"
                      ? "max-w-[88%] overflow-visible rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-user sm:max-w-[75%]"
                      : "w-full overflow-visible"
                  }
                >
                  {checkpoint && (
                    <Button asChild variant="outline" className="mb-2 h-auto w-full justify-start gap-2 rounded-md border-border/70 bg-card/55 px-3 py-2 text-left text-xs font-normal hover:border-primary/45">
                      <Link to="/chat/$sessionId/timeline" params={{ sessionId }} hash={checkpoint.id}>
                        <GitBranch className={`size-4 shrink-0 text-primary ${active ? "animate-pulse" : ""}`} />
                        <span className="min-w-0 flex-1 truncate">Linimasa · {active ? progress : `${complete} langkah selesai`}</span>
                        <span className="shrink-0 text-muted-foreground">{checkpoint.entries.length} aktivitas</span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </Button>
                  )}
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      active || index < lastToolIndex ? null :
                      <MessageResponse
                        key={`${message.id}-${index}`}
                         isAnimating={false}
                        className="wengpt-markdown min-w-0 max-w-full"
                      >
                        {part.text.replace(/\(Perintah\s*—\s*exit \?\s*\)\s*/g, "")}
                      </MessageResponse>
                    ) : part.type === "think" || part.type === "tool" ? null : part.type === "cancelled" ? (
                      <div
                        key={`${message.id}-${index}`}
                        className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive"
                      >
                        <X className="size-3" />
                        Pesan dibatalkan
                      </div>
                    ) : null,
                  )}
                   {message.role === "user" && Boolean(message.files?.length) && (
                     <div className="flex max-w-full flex-wrap gap-1.5 pt-1" aria-label="File terlampir">
                       {message.files?.map((file, index) => {
                         const Icon = file.mediaType.startsWith("image/")
                           ? ImageIcon
                           : file.mediaType.startsWith("video/") ? Video : FileText;
                         return (
                           <span
                             key={`${file.name}-${index}`}
                             title={file.name}
                             className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-[11px] text-primary-foreground"
                           >
                             <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                             <span className="min-w-0 max-w-40 truncate">{file.name}</span>
                             {typeof file.size === "number" && (
                               <span className="shrink-0 opacity-75">
                                 {file.size < 1024 * 1024
                                   ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                                   : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                               </span>
                             )}
                           </span>
                         );
                       })}
                     </div>
                   )}
                  {!active && sources.length > 0 && <WebSources sources={sources} />}
                </MessageContent>
              </Message>
            )})
          )}
          {streaming && (
            <div className="flex items-center gap-2.5 text-sm" role="status">
              <AiDots />
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton
          className="bottom-3 z-30 size-9 border-border/70 bg-card/95 shadow-panel"
          aria-label="Kembali ke pesan terbaru"
        />
      </Conversation>
      <footer className="relative z-20 shrink-0 border-t border-border/50 bg-background/88 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
        {uploadError && (
          <p role="alert" className="mx-auto mb-2 max-w-3xl text-xs text-destructive">
            {uploadError}
          </p>
        )}
        {secretItems.length > 0 && (
          <SecretSlider
            key={secretRuns.map((r) => r.id).join()}
            items={secretItems}
            onClose={() => dismissSecrets(secretRuns.map((r) => r.id))}
            onDone={(results) => {
              dismissSecrets(secretRuns.map((r) => r.id));
              applySecretResults(sessionId, secretRuns.map((r) => r.id), results);
            }}
          />
        )}
        <PromptInput
          multiple
          maxFiles={10}
          maxFileSize={20 * 1024 * 1024}
          onError={(error) =>
            setUploadError(
              error.code === "max_file_size"
                ? "Ukuran maksimal setiap file adalah 20 MB."
                : error.code === "max_files"
                  ? "Maksimal 10 file dalam satu pesan."
                  : "Tipe file ini tidak didukung.",
            )
          }
          onSubmit={({ text, files }) => submit(text, files)}
          className="mx-auto w-full max-w-3xl [&_[data-slot=input-group]]:overflow-hidden [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-border/75 [&_[data-slot=input-group]]:bg-card/72 [&_[data-slot=input-group]]:shadow-panel [&_[data-slot=input-group]]:focus-within:border-ring/60"
        >
          <AttachmentHeader />
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Tulis pesan untuk WenGPT…"
            className="min-h-12 max-h-40 min-w-0 px-4 pt-3 pb-1 text-base leading-6 sm:text-sm"
          />
          <PromptInputFooter className="min-h-10 px-2 pb-2">
            <AttachmentButton />
            <span className="mr-auto text-[10px] text-muted-foreground">Max Size. 20MB</span>
            <PromptInputSubmit
              status={streaming ? "streaming" : "ready"}
              onStop={() => stopSession(sessionId)}
              className="size-8 shrink-0 rounded-lg"
            />
          </PromptInputFooter>
        </PromptInput>
      </footer>
    </main>
  );
}
