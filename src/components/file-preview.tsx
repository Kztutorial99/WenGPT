import { useEffect, useState } from "react";
import { loadAttachment } from "@/lib/attachment-store";
import { getSession, type SavedFile } from "@/lib/chat-store";

/** Link unduhan langsung untuk file hasil sandbox (video hasil download, dll). */
export function sandboxLink(file: SavedFile, download = false) {
  if (!file.path.startsWith("/home/user/") || file.attachmentId) return null;
  const current = typeof window !== "undefined" ? window.location.pathname.split("/")[2] : undefined;
  const id = (file.sessionId && getSession(file.sessionId)?.sandboxId) || (current && getSession(current)?.sandboxId);
  return id ? `/api/sandbox-download?sandboxId=${encodeURIComponent(id)}&path=${encodeURIComponent(file.path)}${download ? "&dl=1" : ""}` : null;
}

const EXT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", pdf: "application/pdf",
};

export function kindOf(file: Pick<SavedFile, "path" | "mediaType">) {
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  const type = EXT_TYPES[ext] || file.mediaType || "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  return "text";
}

/** Pratinjau isi file: gambar, video, audio, PDF, atau teks. */
export function FilePreview({ file, className = "" }: { file: SavedFile; className?: string }) {
  const kind = kindOf(file);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (kind === "text") return;
    if (!file.attachmentId) {
      const link = sandboxLink(file);
      if (link) setUrl(link);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    loadAttachment(file.attachmentId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) return setFailed(true);
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.attachmentId, file.path, kind]);

  if (kind !== "text") {
    if ((!file.attachmentId && !sandboxLink(file)) || failed)
      return (
        <div className={`flex items-center justify-center p-6 text-center text-xs text-muted-foreground ${className}`}>
          Pratinjau tidak tersedia untuk file ini. Unduh untuk membukanya.
        </div>
      );
    if (!url)
      return (
        <div className={`flex items-center justify-center p-6 text-xs text-muted-foreground ${className}`}>
          Memuat pratinjau…
        </div>
      );
    return (
      <div className={`flex items-center justify-center overflow-auto bg-muted/40 p-3 ${className}`}>
        {kind === "image" && (
          <img src={url} onError={() => setFailed(true)} alt={file.path.split("/").pop() ?? ""} className="max-h-full max-w-full rounded-md object-contain" />
        )}
        {kind === "video" && (
          <video src={url} onError={() => setFailed(true)} controls playsInline className="max-h-full max-w-full rounded-md" />
        )}
        {kind === "audio" && <audio src={url} controls className="w-full max-w-md" />}
        {kind === "pdf" && (
          <iframe src={url} title="PDF" className="h-full min-h-[60dvh] w-full rounded-md bg-background" />
        )}
      </div>
    );
  }

  return <TextPreview file={file} className={className} />;
}

const PREVIEW_LINES = 200;

/** Teks: pakai isi tersimpan, atau ambil dari sandbox; tampilkan sebagian dulu, "Lihat semua" untuk lengkap. */
function TextPreview({ file, className }: { file: SavedFile; className: string }) {
  const [text, setText] = useState<string | null>(file.content && !file.truncated ? file.content : null);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    setAll(false);
    if (file.content && !file.truncated) return setText(file.content);
    const fromBlob = file.attachmentId ? loadAttachment(file.attachmentId).then((b) => b?.text() ?? null) : null;
    const link = sandboxLink(file);
    const fromSandbox = link ? fetch(link).then((r) => (r.ok ? r.text() : null)) : null;
    const job = fromBlob ?? fromSandbox;
    if (!job) return setText(file.content || null);
    let cancelled = false;
    setLoading(true);
    job
      .then((t) => !cancelled && setText(t ?? (file.content || null)))
      .catch(() => !cancelled && setText(file.content || null))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [file.path, file.attachmentId, file.content, file.truncated]);

  if (loading && !text)
    return <div className={`flex items-center justify-center p-6 text-xs text-muted-foreground ${className}`}>Memuat isi file…</div>;
  if (text == null)
    return <div className={`flex items-center justify-center p-6 text-center text-xs text-muted-foreground ${className}`}>File ini belum bisa dibaca karena sesi kerjanya sudah berakhir.</div>;
  const lines = text.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const shown = all || !long ? text : lines.slice(0, PREVIEW_LINES).join("\n");
  return (
    <div className={`flex flex-col overflow-auto ${className}`}>
      <pre className="px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words">{shown || "(file kosong)"}</pre>
      {long && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mx-4 mb-3 self-start rounded-md border border-border/70 bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/45">
          {all ? "Tampilkan sebagian" : `Lihat semua (${lines.length} baris)`}
        </button>
      )}
    </div>
  );
}
