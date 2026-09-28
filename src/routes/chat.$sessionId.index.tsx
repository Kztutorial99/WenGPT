import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { Check, CheckCheck, ChevronRight, CircleUserRound, Code2, Copy, Crown, FileText, GitBranch, Globe, Image as ImageIcon, Maximize2, Menu, Minimize2, MoreVertical, Paperclip, Plus, RotateCcw, SendHorizontal, Sparkles, ThumbsDown, ThumbsUp, Video, X } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CyberFrame } from "@/components/cyber-frame";
import { cn } from "@/lib/utils";
import {
  createSession,
  loadCheckpoints,
  isWorkCheckpoint,
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
import { ConnectionStatus } from "@/components/connection-status";
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
  { icon: Sparkles, text: "Kamu bisa bantu apa saja?" },
  { icon: Code2, text: "Cek versi Python dan Node di sandbox" },
  { icon: FileText, text: "Buatkan script Python sederhana" },
];
const fmtTime = (ts?: number) =>
  ts ? new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(/:/g, ".") : "";

/** Aksi di bawah jawaban AI: salin, suka/tidak, dan menu lainnya. */
function MessageFeedback({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* abaikan */
    }
  };
  const btn = "size-7 text-muted-foreground hover:text-primary";
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" className={btn} title="Salin jawaban" onClick={() => void copy()}>
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(btn, vote === "up" && "text-primary")}
        title="Jawaban membantu"
        onClick={() => setVote(vote === "up" ? null : "up")}
      >
        <ThumbsUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(btn, vote === "down" && "text-destructive")}
        title="Jawaban kurang membantu"
        onClick={() => setVote(vote === "down" ? null : "down")}
      >
        <ThumbsDown className="size-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={btn} title="Lainnya">
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void copy()}>Salin teks</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
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
  const [expanded, setExpanded] = useState(false);
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
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="z-20 mx-2 mt-2 flex shrink-0 flex-col gap-2 sm:mx-5 sm:mt-4">
        <CyberFrame>
          <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
            <Button asChild variant="ghost" size="icon" title="Menu" aria-label="Menu" className="cyber-chip size-9 shrink-0 text-muted-foreground hover:text-primary">
              <Link to="/history">
                <Menu className="size-4" />
              </Link>
            </Button>
            <span className="brand-mark size-9 shrink-0 rounded-full">
              <WenGptMark className="size-4" />
            </span>
            <div className="min-w-fit flex-1">
              <h1 className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold sm:text-base">
                WenGPT
                <span className="flex shrink-0 items-center gap-1 pr-0.5 leading-none text-primary">
                  {session?.mode === "webh" ? "WEBH" : "Prime"}
                  <Crown className="size-3.5 shrink-0 fill-primary text-primary" />
                </span>
              </h1>
              <p className="text-[10px] leading-tight text-muted-foreground">AI Tanpa Batas</p>
            </div>
            <div className="flex min-w-0 shrink">
              <ConnectionStatus />
            </div>
            <Button asChild variant="ghost" size="icon" title="Pengaturan" aria-label="Pengaturan" className="hidden size-9 shrink-0 rounded-full border border-brand-line text-primary sm:grid">
              <Link to="/settings">
                <CircleUserRound className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Sesi baru"
              aria-label="Sesi baru"
              className="size-9 shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => {
                const id = createSession();
                window.location.assign(`/chat/${id}`);
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </CyberFrame>
        <CyberFrame>
          <AppNav sessionId={sessionId} />
        </CyberFrame>
      </header>
      <Conversation className="min-h-0 min-w-0">
        <ConversationScrollOnComplete streaming={streaming} />
        <ConversationContent className="mx-auto min-h-full w-full min-w-0 max-w-3xl gap-7 px-3 py-6 sm:px-6 sm:py-8">
          {!session?.messages.length ? (
            <section className="flex min-h-[62dvh] flex-col items-center justify-center text-center">
              <span className="brand-mark brand-hero mb-6 size-16 rounded-2xl shadow-[0_0_55px_-10px_var(--mark-glow)]">
                <WenGptMark className="size-8" />
              </span>
              <h2 className="text-balance text-3xl font-bold sm:text-4xl">
                WenGPT{" "}
                <span className="relative inline-block text-primary">
                  <Crown className="absolute -top-3 left-1/2 size-4 -translate-x-1/2 fill-primary text-primary" />
                  {session?.mode === "webh" ? "WEBH" : "Prime"}
                </span>
              </h2>
              <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-muted-foreground">
                Mau mengerjakan apa hari ini?
              </p>
              <div className="mt-8 flex w-full max-w-xl flex-col gap-2.5">
                {STARTERS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => submit(text)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-brand-line/70 bg-card/60 px-3 py-3 text-left text-sm leading-5 transition-colors hover:border-primary/60 hover:bg-card"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand-line/70 bg-background/60 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">{text}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
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
              const hasResponse = message.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
              const work = message.role === "assistant" && isWorkCheckpoint(checkpoint, message.agent);
              const complete = runs.filter((run) => !!run.output).length;
              const lastToolIndex = message.parts.reduce((lastIndex, part, index) => part.type === "tool" ? index : lastIndex, -1);
              const sources = message.parts
                .flatMap((part) => (part.type === "tool" && part.run.name === "web_search" ? (part.run.output?.results ?? []) : []))
                .filter((r, i, all) => all.findIndex((x) => x.url === r.url) === i)
                .slice(0, 6);
              const tailPart = message.parts[message.parts.length - 1];
              const answering = active && tailPart?.type === "text" && tailPart.text.trim().length > 0 && lastToolIndex >= 0;
              const firstText = message.parts[0]?.type === "text" && message.parts[0].text.trim() && lastToolIndex > 0 ? 0 : -1;
              const progress = message.agent?.label ??
                (message.agent?.state === "TESTING" ? "Menguji aplikasi" : "Mengerjakan project");
              const workCard = (
                <>
                  {checkpoint && work && (
                    <Button asChild variant="outline" className="mb-2 h-auto w-full justify-start gap-2 rounded-md border-border/70 bg-card/55 px-3 py-2 text-left text-xs font-normal hover:border-primary/45">
                      <Link to="/chat/$sessionId/timeline" params={{ sessionId }} hash={checkpoint.id}>
                        <GitBranch className={`size-4 shrink-0 text-primary ${active && !answering ? "animate-pulse" : ""}`} />
                        <span className="min-w-0 flex-1 truncate">Linimasa · {active && !answering ? progress : `${complete} langkah selesai`}</span>
                        <span className="shrink-0 text-muted-foreground">{checkpoint.entries.length} aktivitas</span>
                        {message.agent?.startedAt && (
                          <WorkDuration start={message.agent.startedAt} end={message.agent.endedAt ?? (active && !answering ? undefined : message.agent.lastEventAt)} />
                        )}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </Button>
                  )}
                  {message.role === "assistant" && message.agent && work && (
                    <AgentProgress
                      agent={message.agent}
                      sessionId={sessionId}
                      active={active}
                      answering={answering}
                      onResume={message.id === last?.id && !streaming ? () => void resumeSession(sessionId) : undefined}
                    />
                  )}
                </>
              );
              return (
              <Message key={message.id} from={message.role} className="min-w-0 max-w-full">
                {message.role === "assistant" && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-card/70 py-1 pl-1 pr-3 text-xs font-semibold">
                      <span className="grid size-6 place-items-center rounded-full border border-brand-line text-primary">
                        <WenGptMark className="size-3.5" />
                      </span>
                      WenGPT
                      <Crown className="size-3.5 fill-primary text-primary" />
                    </span>
                    {active && message.agent?.label === "Berpikir" && !work && (
                      <span className="ml-1 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-normal text-muted-foreground">Berpikir</span>
                    )}
                  </div>
                )}
                {(message.role === "user" || hasResponse || work) && (
                <MessageContent
                  className={
                    message.role === "user"
                      ? "max-w-[88%] overflow-visible rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-user sm:max-w-[75%]"
                      : "cyber-card w-full overflow-visible"
                  }
                >
                  {firstText < 0 && workCard}
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <Fragment key={`${message.id}-${index}`}>
                      <MessageResponse
                         isAnimating={active && !hasResponse}
                        className="wengpt-markdown min-w-0 max-w-full"
                      >
                        {part.text.replace(/\(Perintah\s*—\s*exit \?\s*\)\s*/g, "")}
                      </MessageResponse>
                      {index === firstText && workCard}
                      </Fragment>
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
                            Coba lagi
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
                  {message.role === "assistant" && message.id === last?.id && !streaming && !work &&
                    (message.agent?.state === "DISCONNECTED" || message.agent?.state === "PAUSED") &&
                    !message.parts.some((part) => part.type === "cancelled") && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-warning">{message.agent.label ?? "Koneksi terputus"}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void resumeSession(sessionId)}
                          className="h-7 gap-1.5 rounded-full border-border/70 bg-card/60 px-3 text-xs font-medium"
                        >
                          <RotateCcw className="size-3" />
                          Coba lagi
                        </Button>
                      </div>
                    )}
                  {!active && sources.length > 0 && <WebSources sources={sources} />}
                  {message.role === "user" && (
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-primary-foreground/80">
                      {fmtTime(message.createdAt)}
                      <CheckCheck className="size-3" />
                    </div>
                  )}
                  {message.role === "assistant" && hasResponse && !active && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                      <span className="text-[10px] text-muted-foreground">{fmtTime(message.createdAt)}</span>
                      <MessageFeedback
                        text={message.parts
                          .filter((part): part is { type: "text"; text: string } => part.type === "text")
                          .map((part) => part.text)
                          .join("\n\n")}
                      />
                    </div>
                  )}
                </MessageContent>
                )}
              </Message>
            )})
          )}
          {streaming && lastAssistant && (() => {
            // Titik-titik hanya saat menunggu: hilang ketika teks jawaban mengalir
            // atau ketika kartu kerja (Linimasa) sudah menampilkan progresnya sendiri.
            const tail = lastAssistant.parts[lastAssistant.parts.length - 1];
            if (tail?.type === "text" && tail.text.trim().length > 0) return null;
            const cp = checkpoints.find((item) => item.messageIds.includes(lastAssistant.id));
            if (isWorkCheckpoint(cp, lastAssistant.agent)) return null;
            const a = lastAssistant.agent;
            const hint = !a || a.state === "RECEIVED" ? "Menyambungkan" : "";
            return (
              <div className="flex items-center gap-2.5 text-sm" role="status">
                <AiDots />
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
              </div>
            );
          })()}
        </ConversationContent>
        <ConversationScrollButton
          className="bottom-3 z-30 size-9 border-border/70 bg-card/95 shadow-panel"
          aria-label="Kembali ke pesan terbaru"
        />
      </Conversation>
       <footer className="relative z-20 shrink-0 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-5">
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
        <CyberFrame className="mx-auto w-full max-w-3xl" innerClassName="bg-card/95 backdrop-blur-xl">
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
            className="[&_[data-slot=input-group]]:overflow-hidden [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent [&_[data-slot=input-group]]:shadow-none"
          >
            <AttachmentHeader />
            <div className="relative w-full px-2.5 pt-2">
              <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 z-10 grid size-8 select-none place-items-center rounded-full border border-brand-line bg-card text-primary">
                <WenGptMark className="size-4" />
              </span>
              <PromptInputTextarea
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder={`Tulis pesan untuk WenGPT ${session?.mode === "webh" ? "WEBH" : "Prime"}...`}
                className={cn(
                  "max-h-56 w-full min-w-0 pl-12 pr-2 pt-3.5 pb-1 text-left text-base leading-6 sm:text-sm",
                  expanded ? "min-h-40" : "min-h-12",
                )}
              />
            </div>
            <PromptInputFooter className="min-h-11 px-2 pb-2">
              <AttachmentButton />
              <span className="mr-auto rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground">Max Size: 20MB</span>
              <PromptInputButton
                aria-label={expanded ? "Kecilkan kotak pesan" : "Perbesar kotak pesan"}
                title={expanded ? "Kecilkan kotak pesan" : "Perbesar kotak pesan"}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </PromptInputButton>
              <PromptInputSubmit
                status={streaming ? "streaming" : "ready"}
                onStop={() => stopSession(sessionId)}
                className="size-9 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {streaming ? undefined : <SendHorizontal className="size-4" />}
              </PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </CyberFrame>
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

/** Durasi kerja Linimasa: berjalan live, lalu berhenti saat selesai. */
function WorkDuration({ start, end }: { start: number; end?: number | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  const sec = Math.max(0, Math.round(((end ?? now) - start) / 1000));
  const text = sec < 60 ? `${sec} dtk` : `${Math.floor(sec / 60)} mnt ${sec % 60} dtk`;
  return (
    <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground" title="Durasi Linimasa">
      {text}
    </span>
  );
}
