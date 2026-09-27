import { useEffect, useState } from "react";
import { loadAttachment } from "@/lib/attachment-store";
import { getSession, type SavedFile } from "@/lib/chat-store";

/** Link unduhan langsung untuk file hasil sandbox (video hasil download, dll). */
export function sandboxLink(file: SavedFile) {
  if (!file.key?.startsWith("sb:") || !file.sessionId) return null;
  const id = getSession(file.sessionId)?.sandboxId;
  return id ? `/api/sandbox-download?sandboxId=${encodeURIComponent(id)}&path=${encodeURIComponent(file.path)}` : null;
}

const EXT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", pdf: "application/pdf",
};

export function kindOf(file: Pick<SavedFile, "path" | "mediaType">) {
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  const type = (file.mediaType !== "application/octet-stream" && file.mediaType) || EXT_TYPES[ext] || "";
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
          <img src={url} alt={file.path.split("/").pop() ?? ""} className="max-h-full max-w-full rounded-md object-contain" />
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

  return (
    <pre className={`overflow-auto px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words ${className}`}>
      {file.content
        ? `${file.content}${file.truncated ? "\n\n… cuplikan dipotong. Unduh file untuk melihat isi lengkap." : ""}`
        : "Pratinjau teks tidak tersedia untuk file ini. Unduh untuk membukanya."}
    </pre>
  );
}
