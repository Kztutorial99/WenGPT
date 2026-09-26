import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen as FilesIcon,
  GitBranch,
  X,
} from "lucide-react";
import { CopyButton } from "@/components/chat-code";
import { Button } from "@/components/ui/button";
import { loadAllFiles, markFilesRead, normalizePath, type SavedFile } from "@/lib/chat-store";
import { loadAttachment } from "@/lib/attachment-store";
import { useChatStore } from "@/lib/use-chat-store";
export const Route = createFileRoute("/chat/$sessionId/files")({
  head: () => ({
    meta: [
      { title: "File Manager — WenGPT" },
      { name: "description", content: "File yang dibuat WenGPT di semua sesi." },
      { property: "og:title", content: "File Manager — WenGPT" },
      { property: "og:description", content: "File yang dibuat WenGPT di semua sesi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FilesPage,
});
const ROOT = "/home/user";
const name = (path: string) => path.split("/").pop() || path;
async function download(file: SavedFile) {
  const blob = file.attachmentId
    ? await loadAttachment(file.attachmentId)
    : new Blob([file.content], { type: "text/plain;charset=utf-8" });
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name(file.path);
  anchor.click();
  URL.revokeObjectURL(url);
}
function formatSize(value?: number) {
  if (value == null) return "";
  return value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function FilesPage() {
  const { sessionId } = Route.useParams();
  useChatStore();
  const files = loadAllFiles();
  const [dir, setDir] = useState(ROOT);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    markFilesRead();
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      const path = normalizePath(hash);
      setOpen(path);
      setDir(path.split("/").slice(0, -1).join("/") || ROOT);
    }
  }, []);
  const { folders, dirFiles } = useMemo(() => {
    const folderSet = new Map<string, number>();
    const dirFiles: SavedFile[] = [];
    for (const file of files) {
      const rel = file.path.startsWith(`${ROOT}/`) ? file.path.slice(ROOT.length + 1) : file.path;
      const relDir = rel.includes("/") ? rel.split("/").slice(0, -1).join("/") : "";
      const currentRel = dir === ROOT ? "" : dir.slice(ROOT.length + 1);
      if (relDir === currentRel) {
        dirFiles.push(file);
        continue;
      }
      if (relDir.startsWith(currentRel ? `${currentRel}/` : "")) {
        const rest = relDir.slice(currentRel ? currentRel.length + 1 : 0);
        const top = rest.split("/")[0];
        if (top) folderSet.set(top, (folderSet.get(top) ?? 0) + 1);
      }
    }
    const folders = [...folderSet.entries()]
      .map(([folderName, count]) => ({ name: folderName, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { folders, dirFiles };
  }, [files, dir]);
  const crumbs = useMemo(() => {
    const rel = dir === ROOT ? "" : dir.slice(ROOT.length + 1);
    const parts = rel ? rel.split("/") : [];
    return parts.map((part, index) => ({
      label: part,
      path: `${ROOT}/${parts.slice(0, index + 1).join("/")}`,
    }));
  }, [dir]);
  const active = files.find((file) => file.path === open);
  return (
    <main className="h-dvh overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-background/88 px-4 py-3 backdrop-blur-xl">
        <Button asChild variant="outline" size="icon">
          <Link to="/chat/$sessionId" params={{ sessionId }}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FilesIcon className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">File Manager</h1>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {files.length} file · dipakai di semua sesi
          </p>
        </div>
        <Button asChild variant="outline" size="icon">
          <Link to="/chat/$sessionId/timeline" params={{ sessionId }}>
            <GitBranch className="size-4" />
          </Link>
        </Button>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-5">
        <nav className="mb-3 flex min-w-0 items-center gap-1 overflow-x-auto text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setDir(ROOT)}
            className={`shrink-0 rounded px-1.5 py-1 ${dir === ROOT ? "font-semibold text-foreground" : "hover:text-foreground"}`}
          >
            Beranda
          </button>
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="size-3 opacity-60" />
              <button
                type="button"
                onClick={() => setDir(crumb.path)}
                className={`rounded px-1.5 py-1 ${index === crumbs.length - 1 ? "font-semibold text-foreground" : "hover:text-foreground"}`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
        {folders.length === 0 && dirFiles.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            {dir === ROOT ? "Belum ada file." : "Folder ini kosong."}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
            {folders.map((folder) => (
              <li key={folder.name} className="border-b border-border/50 last:border-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDir(dir === ROOT ? `${ROOT}/${folder.name}` : `${dir}/${folder.name}`)}
                  className="h-auto w-full min-w-0 justify-start rounded-none px-3 py-3 text-left"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                    <Folder className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{folder.name}</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {folder.count} file
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </li>
            ))}
            {dirFiles.map((file) => (
              <li key={file.path} className="border-b border-border/50 last:border-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(file.path)}
                  className="h-auto w-full min-w-0 justify-start rounded-none px-3 py-3 text-left"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                    <FileText className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name(file.path)}</span>
                    <span className="block truncate font-mono text-[11px] font-normal text-muted-foreground">
                      {name(file.path)} {file.size != null ? `· ${formatSize(file.size)}` : ""}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {active && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background/96 backdrop-blur-xl">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name(active.path)}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{active.path}</p>
            </div>
            <div className="flex">
              {active.content && <CopyButton text={active.content} />}
              <Button
                variant="ghost"
                size="icon"
                title="Unduh file"
                onClick={() => void download(active)}
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Tutup"
                onClick={() => {
                  setOpen(null);
                  history.replaceState(null, "", `/chat/${sessionId}/files`);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words">
            {active.content
              ? `${active.content}${active.truncated ? "\n\n… cuplikan dipotong. Unduh file untuk melihat isi lengkap." : ""}`
              : "Pratinjau teks tidak tersedia untuk file ini. Unduh untuk membukanya."}
          </pre>
        </div>
      )}
    </main>
  );
}
