import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, ChevronRight, FileText, Paperclip, Plus, Terminal, X } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { AiDots, SecretRequestNote, SecretResultCard, SecretSlider } from "@/components/secret-cards";
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
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  createSession,
  getSession,
  sendMessage,
  setActiveSession,
  stopSession,
  type ToolRun,
} from "@/lib/chat-store";
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
function duration(ms?: number) {
  return ms == null
    ? ""
    : ms < 1000
      ? `${ms} md`
      : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} dtk`;
}
function ToolCard({ run, sessionId }: { run: ToolRun; sessionId: string }) {
  if (run.name === "request_secret") return <SecretRequestNote run={run} />;
  if (run.name === "list_secrets" || run.name === "test_secret") return <SecretResultCard run={run} />;
  const failed = !!run.output && ((run.output.exitCode ?? 0) !== 0 || run.output.ok === false);
  const command = run.name === "run_command";
  return (
    <Link
      to={command ? "/chat/$sessionId/timeline" : "/chat/$sessionId/files"}
      params={{ sessionId }}
      hash={command ? run.id : String(run.input.path ?? "")}
      className="my-2 flex min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-card/55 px-3 py-2.5 transition-colors hover:border-primary/45 active:bg-muted"
    >
      {command ? (
        <Terminal className="size-4 shrink-0 text-primary" />
      ) : (
        <FileText className="size-4 shrink-0 text-primary" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {(command ? run.input.command : run.input.path) ||
          (command ? <AiDots /> : "Menyusun isi file…")}
      </span>
      <span
        className={`shrink-0 text-[11px] ${failed ? "text-destructive" : run.output ? "text-success" : "text-muted-foreground"}`}
      >
        {!run.output ? (
          command && !run.input.command ? (
            <AiDots />
          ) : (
            <Shimmer className="text-[11px]">{command ? "Menjalankan…" : "Menulis file…"}</Shimmer>
          )
        ) : failed ? (
          "Gagal"
        ) : (
          duration(run.durationMs) || "Selesai"
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
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
function Chat() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const session = snapshot.sessions.find((item) => item.id === sessionId);
  const [input, setInput] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dismissedSecrets, setDismissedSecrets] = useState<Set<string>>(new Set());
  const box = useViewportBox();
  const streaming = snapshot.streamingIds.includes(sessionId);
  const last = session?.messages.at(-1);
  // Form secret terbaru yang masih menunggu diisi, ditampilkan sebagai panel di atas kotak pesan.
  const secretRun = session?.messages
    .flatMap((message) => message.parts)
    .filter((part): part is { type: "tool"; run: ToolRun } => part.type === "tool" && part.run.name === "request_secret")
    .map((part) => part.run)
    .at(-1);
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
  const waiting = streaming && last?.role === "assistant" && last.parts.length === 0;
  const runningTool =
    streaming &&
    last?.role === "assistant" &&
    last.parts.some((part) => part.type === "tool" && !part.run.output);
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
            session.messages.map((message) => (
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
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse
                        key={`${message.id}-${index}`}
                        isAnimating={streaming && message.id === last?.id}
                        className="wengpt-markdown min-w-0 max-w-full"
                      >
                        {part.text}
                      </MessageResponse>
                    ) : (
                      <ToolCard key={part.run.id} run={part.run} sessionId={sessionId} />
                    ),
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {(runningTool || waiting) && (
            <div className="flex items-center gap-2.5 text-sm" role="status">
              {runningTool ? (
                <Shimmer className="text-sm">Sedang mengerjakan…</Shimmer>
              ) : (
                <AiDots />
              )}
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
        {secretRun && !dismissedSecrets.has(secretRun.id) && (
          <SecretSlider run={secretRun} onClose={() => setDismissedSecrets((ids) => new Set(ids).add(secretRun.id))} />
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
