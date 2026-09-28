import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Globe, ChevronRight, FileText, GitBranch, Image as ImageIcon, Paperclip, Plus, RotateCcw, Video, X } from "lucide-react";
import { WenGptMark } from "@/components/wen-gpt-mark";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  createSession,
  loadCheckpoints,
  resumeSession,
  sendMessage,
  setActiveSession,
  stopSession,
  type ToolRun,
  type WebResult,
} from "@/lib/chat-store";
import { applySecretResults, loadAllFiles, type SavedFile } from "@/lib/chat-store";
import { FilePreview } from "@/components/file-preview";
import { AgentProgress } from "@/components/agent-progress";
import { useChatStore } from "@/lib/use-chat-store";
import { useViewportBox } from "@/lib/viewport";

export const Route = createFileRoute("/chat/$sessionId/")({
  head: () => ({
    meta: [
      { title: "Chat — WenGPT Prime" },
      { name: "description", content: "Sesi percakapan WenGPT Prime dengan terminal dan File Manager." },
      { property: "og:title", content: "Chat — WenGPT Prime" },
      {
        property: "og:description",
        content: "Sesi percakapan WenGPT Prime dengan terminal dan File Manager.",
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = attachments.files.find((f) => f.id === previewId);
  return (
    <PromptInputHeader className={attachments.files.length ? "px-3 pt-2" : "hidden"}>
      {attachments.files.map((file) => {
        const isImage = file.mediaType?.startsWith("image/");
        const isVideo = file.mediaType?.startsWith("video/");
        const Icon = isImage ? ImageIcon : isVideo ? Video : FileText;
        return (
          <span
            key={file.id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/70 py-1 pr-1 pl-1 text-[11px]"
          >
            <button
              type="button"
              onClick={() => setPreviewId(file.id)}
              className="inline-flex min-w-0 items-center gap-1.5"
              aria-label={`Pratinjau ${file.filename ?? "file"}`}
            >
              {isImage && file.url ? (
                <img src={file.url} alt="" className="size-6 shrink-0 rounded object-cover" />
              ) : (
                <Icon className="size-3.5 shrink-0 text-primary" />
              )}
              <span className="max-w-40 truncate">{file.filename ?? "file"}</span>
            </button>
            <PromptInputButton
              className="size-5"
              aria-label={`Hapus ${file.filename ?? "file"}`}
              onClick={() => attachments.remove(file.id)}
            >
              <X className="size-3" />
            </PromptInputButton>
          </span>
        );
      })}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="w-[min(92vw,26rem)] max-w-[92vw] gap-3 p-4">
          <DialogTitle className="truncate pr-6 text-sm">{preview?.filename ?? "File"}</DialogTitle>
          {preview?.mediaType?.startsWith("image/") && preview.url ? (
            <img src={preview.url} alt={preview.filename ?? ""} className="max-h-[50dvh] w-full rounded-md object-contain bg-muted/40" />
          ) : preview?.mediaType?.startsWith("video/") && preview.url ? (
            <video src={preview.url} controls className="max-h-[50dvh] w-full rounded-md bg-muted/40" />
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
              <FileText className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{preview?.mediaType || "file"}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
  const [chatPreview, setChatPreview] = useState<SavedFile | null>(null);
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
    // Saat AI masih menjawab, lempar agar teks & lampiran tidak dibersihkan.
    if (streaming) throw new Error("busy");
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
      className="chat-shell cyber-grid fixed inset-x-0 top-0 flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="z-20 mx-2 mt-2 flex shrink-0 flex-col overflow-hidden rounded-2xl border border-brand-line bg-card/95 backdrop-blur-xl sm:mx-5 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-2">
        <div className="flex min-w-0 items-center justify-center gap-2.5 px-3 py-2.5 sm:justify-start sm:px-0 sm:py-0">
          <span className="brand-mark size-8">
            <WenGptMark className="size-4" />
          </span>
          <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:text-base">
            <span>WenGPT</span>
            <span className="rounded-md border border-brand-line px-2 py-0.5 text-primary">Prime</span>
          </h1>
        </div>
        <div className="flex items-center justify-center border-t border-border/60 px-1 py-0.5 sm:justify-end sm:border-0 sm:p-0">
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
                <WenGptMark className="size-5" />
              </span>
              <h2 className="text-balance text-2xl font-semibold sm:text-3xl">WenGPT <span className="text-primary">Prime</span></h2>
              <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-muted-foreground">
                Mau mengerjakan apa hari ini?
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
                  : currentRun?.name === "download_file"
                    ? "Mengunduh file"
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
                      <WenGptMark className="size-4" />
                    </span>
                    WenGPT Prime
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
                  {message.role === "assistant" && message.agent && (
                    <AgentProgress
                      agent={message.agent}
                      sessionId={sessionId}
                      active={active}
                      onResume={message.id === last?.id && !streaming ? () => void resumeSession(sessionId) : undefined}
                    />
                  )}
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse
                        key={`${message.id}-${index}`}
                         isAnimating={active}
                        className="wengpt-markdown min-w-0 max-w-full"
                      >
                        {part.text.replace(/\(Perintah\s*—\s*exit \?\s*\)\s*/g, "")}
                      </MessageResponse>
                    ) : part.type === "think" || part.type === "tool" ? null : part.type === "cancelled" ? (
                      <div key={`${message.id}-${index}`} className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
                          <X className="size-3" />
                          Jawaban dihentikan
                        </span>
                        {message.id === last?.id && !streaming && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Sambung jawaban yang tadi berhenti"
                            onClick={() => void resumeSession(sessionId)}
                            className="h-7 gap-1.5 rounded-full border-border/70 bg-card/60 px-3 text-xs font-medium"
                          >
                            <RotateCcw className="size-3" />
                            Lanjutkan jawaban
                          </Button>
                        )}
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
                           <button
                             type="button"
                             key={`${file.name}-${index}`}
                             title={`Lihat ${file.name}`}
                             onClick={() => {
                               const all = loadAllFiles().filter((f) => f.attachmentId);
                               const found =
                                 all.find((f) => f.sessionId === sessionId && f.path.split("/").pop() === file.name) ??
                                 all.find((f) => f.path.split("/").pop() === file.name);
                               setChatPreview(found ?? { path: file.name, content: "", runId: "", ask: "", failed: false, updatedAt: 0, mediaType: file.mediaType });
                             }}
                             className="cursor-pointer hover:bg-primary-foreground/20 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-[11px] text-primary-foreground"
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
                           </button>
                         );
                       })}
                     </div>
                   )}
                  {message.role === "assistant" && !active && lastToolIndex >= 0 &&
                    !message.parts.some((part, index) => part.type === "text" && part.text.trim()) &&
                    !message.parts.some((part) => part.type === "cancelled") && (
                      <p className="text-sm text-muted-foreground">
                        Proses selesai. Lihat hasil lengkapnya di Linimasa{sources.length ? " atau sumber di bawah" : ""}.
                      </p>
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
       <footer className="relative z-20 shrink-0 border-t border-border/70 bg-background/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
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
           className="mx-auto w-full max-w-3xl [&_[data-slot=input-group]]:overflow-hidden [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-brand-line [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-panel [&_[data-slot=input-group]]:focus-within:border-ring"
        >
          <AttachmentHeader />
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Tulis pesan untuk WenGPT Prime…"
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
      <Dialog open={chatPreview !== null} onOpenChange={(o) => !o && setChatPreview(null)}>
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-3 p-4">
          <DialogTitle className="truncate pr-6 text-sm">{chatPreview?.path.split("/").pop() ?? "File"}</DialogTitle>
          {chatPreview && (
            <FilePreview
              key={chatPreview.attachmentId ?? chatPreview.path}
              file={chatPreview}
              className="max-h-[75dvh] min-h-40 rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
