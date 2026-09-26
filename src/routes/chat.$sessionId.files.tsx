import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CopyPlus,
  Download,
  EllipsisVertical,
  FilePlus,
  FileText,
  FolderPlus,
  Folder,
  FolderInput,
  FolderOpen,
  FolderOpen as FilesIcon,
  GitBranch,
  PencilLine,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/chat-code";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  countUnder,
  createFolder,
  createTextFile,
  duplicateFile,
  listFolders,
  folderPaths,
  isValidName,
  loadAllFiles,
  markFilesRead,
  moveFile,
  moveFolder,
  normalizePath,
  removeFile,
  removeFolder,
  renameFile,
  renameFolder,
  type SavedFile,
} from "@/lib/chat-store";
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
const MAX_RESULTS = 60;
const name = (path: string) => path.split("/").pop() || path;
const relOf = (path: string) => (path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path);
const parentOf = (path: string) => path.split("/").slice(0, -1).join("/") || ROOT;
const messageOf = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Terjadi kesalahan.";

type FolderRow = { name: string; path: string; count: number };
type Action = { icon: LucideIcon; label: string; run: () => void; danger?: boolean };
type NameTarget = { title: string; hint: string; value: string; submit: (value: string) => void };
type MoveTarget = {
  title: string;
  hint: string;
  from: string;
  excluded?: string;
  submit: (dir: string) => void;
};
type DeleteTarget = { title: string; detail: string; submit: () => void };

async function download(file: SavedFile) {
  const blob = file.attachmentId
    ? await loadAttachment(file.attachmentId)
    : new Blob([file.content], { type: "text/plain;charset=utf-8" });
  if (!blob) throw new Error("Isi file tidak bisa dibaca.");
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

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(needle, cursor);
    if (at === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="rounded-xs bg-primary/25 px-0.5 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    cursor = at + needle.length;
  }
  return <>{parts}</>;
}

function snippetAt(content: string, index: number, length: number) {
  const from = Math.max(0, index - 40);
  const to = Math.min(content.length, index + length + 70);
  const body = content.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "… " : ""}${body}${to < content.length ? " …" : ""}`;
}

function RowMenu({ label, actions }: { label: string; actions: Action[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Aksi untuk ${label}`}
          title={`Aksi untuk ${label}`}
          className="shrink-0 text-muted-foreground"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-xl">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onSelect={action.run}
            className={action.danger ? "text-destructive" : ""}
          >
            <action.icon className="size-4" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowButton({
  onClick,
  icon,
  title,
  meta,
  trailing,
}: {
  onClick: () => void;
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta ? (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{meta}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}

function NameDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  target: NameTarget | null;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open && target) setValue(target.value);
  }, [open, target]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{target?.title}</DialogTitle>
          <DialogDescription className="font-mono text-[11px]">{target?.hint}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!target) return;
            try {
              target.submit(value);
              onOpenChange(false);
            } catch (error) {
              toast.error(messageOf(error));
            }
          }}
          className="grid gap-4"
        >
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Nama baru"
            className="h-11 font-mono text-sm"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  target: MoveTarget | null;
}) {
  const [selected, setSelected] = useState(ROOT);
  const [newFolder, setNewFolder] = useState("");

  useEffect(() => {
    if (!open || !target) return;
    setNewFolder("");
    setSelected(target.from === ROOT ? ROOT : parentOf(target.from));
  }, [open, target]);

  const folders = useMemo(() => {
    if (!open || !target) return [] as { path: string; label: string }[];
    const excluded = target.excluded;
    return folderPaths()
      .filter((path) => path !== excluded && !path.startsWith(`${excluded}/`))
      .map((path) => ({ path, label: relOf(path) }));
  }, [open, target]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{target?.title}</DialogTitle>
          <DialogDescription className="font-mono text-[11px]">{target?.hint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-card/50">
            <button
              type="button"
              onClick={() => setSelected(ROOT)}
              className="flex w-full min-w-0 items-center gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
            >
              <FolderOpen className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">/files/home</span>
              {selected === ROOT ? <Check className="size-4 shrink-0 text-primary" /> : null}
            </button>
            {folders.map((folder) => (
              <button
                key={folder.path}
                type="button"
                onClick={() => setSelected(folder.path)}
                className="flex w-full min-w-0 items-center gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/40"
              >
                <Folder className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{folder.label}</span>
                {selected === folder.path ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            ))}
          </div>
          <Input
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
            placeholder="Folder baru di sini (opsional)"
            aria-label="Nama folder baru"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 text-sm"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!target) return;
              const extra = newFolder.trim();
              if (extra && !isValidName(extra)) {
                toast.error("Nama folder baru tidak valid.");
                return;
              }
              try {
                target.submit(extra ? `${selected}/${extra}` : selected);
                onOpenChange(false);
              } catch (error) {
                toast.error(messageOf(error));
              }
            }}
          >
            Pindahkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  target: DeleteTarget | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{target?.title}</DialogTitle>
          <DialogDescription>{target?.detail}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!target) return;
              try {
                target.submit();
                onOpenChange(false);
              } catch (error) {
                toast.error(messageOf(error));
              }
            }}
          >
            <Trash2 className="size-4" />
            Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Hit = { file: SavedFile; rel: string; score: number; snippet: string };

function FilesPage() {
  const { sessionId } = Route.useParams();
  const snapshot = useChatStore();
  const files = loadAllFiles();
  const [dir, setDir] = useState(ROOT);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nameTarget, setNameTarget] = useState<NameTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    markFilesRead();
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      const path = normalizePath(hash);
      setOpen(path);
      setDir(path.split("/").slice(0, -1).join("/") || ROOT);
    }
  }, []);

  const q = query.trim();
  const searching = q.length > 0;

  const { items, total } = useMemo(() => {
    if (!searching) return { items: [] as Hit[], total: 0 };
    const needle = q.toLowerCase();
    const hits: Hit[] = [];
    for (const file of files) {
      const rel = relOf(file.path);
      const base = name(file.path);
      const content = file.content ?? "";
      const contentAt = content ? content.toLowerCase().indexOf(needle) : -1;
      let score = 4;
      if (base.toLowerCase() === needle) score = 0;
      else if (base.toLowerCase().startsWith(needle)) score = 1;
      else if (base.toLowerCase().includes(needle)) score = 2;
      else if (rel.toLowerCase().includes(needle)) score = 3;
      else if (contentAt >= 0) score = 5;
      else continue;
      hits.push({
        file,
        rel,
        score,
        snippet: contentAt >= 0 && score >= 5 ? snippetAt(content, contentAt, needle.length) : "",
      });
    }
    hits.sort((a, b) => a.score - b.score || a.rel.localeCompare(b.rel));
    return { items: hits.slice(0, MAX_RESULTS), total: hits.length };
  }, [files, q, searching]);

  const folderHits = useMemo(() => {
    if (!searching) return [] as { path: string; label: string }[];
    const needle = q.toLowerCase();
    const seen = new Set<string>();
    for (const file of files) {
      const parts = relOf(file.path).split("/");
      for (let i = 1; i < parts.length; i += 1) seen.add(parts.slice(0, i).join("/"));
    }
    return [...seen]
      .filter((rel) => rel.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 10)
      .map((rel) => ({ path: `${ROOT}/${rel}`, label: rel }));
  }, [files, q, searching]);

  const { folders, dirFiles } = useMemo(() => {
    const folderSet = new Map<string, number>();
    const dirFiles: SavedFile[] = [];
    for (const file of files) {
      const relDir = (() => {
        const rel = relOf(file.path);
        return rel.includes("/") ? rel.split("/").slice(0, -1).join("/") : "";
      })();
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
    const currentRel = dir === ROOT ? "" : dir.slice(ROOT.length + 1);
    for (const folder of listFolders()) {
      if (!folder.startsWith(`${ROOT}/`)) continue;
      const rel = folder.slice(ROOT.length + 1);
      if (currentRel && !rel.startsWith(`${currentRel}/`)) continue;
      const top = rel.slice(currentRel ? currentRel.length + 1 : 0).split("/")[0];
      if (top && !folderSet.has(top)) folderSet.set(top, 0);
    }
    const folders = [...folderSet.entries()]
      .map(([folderName, count]) => ({
        name: folderName,
        path: dir === ROOT ? `${ROOT}/${folderName}` : `${dir}/${folderName}`,
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { folders, dirFiles };
  }, [files, dir, snapshot.folders]);

  const crumbs = useMemo(() => {
    const rel = dir === ROOT ? "" : dir.slice(ROOT.length + 1);
    const parts = rel ? rel.split("/") : [];
    return parts.map((part, index) => ({
      label: part,
      path: `${ROOT}/${parts.slice(0, index + 1).join("/")}`,
    }));
  }, [dir]);

  const active = files.find((file) => file.path === open);

  const goToFolder = (path: string) => {
    setDir(path);
    setQuery("");
    setOpen(null);
    history.replaceState(null, "", `/chat/${sessionId}/files`);
    searchRef.current?.blur();
  };

  const closePreview = (path: string) => {
    if (open === path) {
      setOpen(null);
      history.replaceState(null, "", `/chat/${sessionId}/files`);
    }
  };

  const duplicate = async (file: SavedFile) => {
    try {
      const copy = await duplicateFile(file.key ?? file.path);
      toast.success(`“${name(copy.path)}” dibuat di ${relOf(parentOf(copy.path))}.`);
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const fileActions = (file: SavedFile, inSearch = false): Action[] => {
    const key = file.key ?? file.path;
    const actions: Action[] = [];
    if (inSearch)
      actions.push({
        icon: FolderOpen,
        label: "Buka foldernya",
        run: () => goToFolder(parentOf(file.path)),
      });
    actions.push(
      {
        icon: PencilLine,
        label: "Ganti nama",
        run: () =>
          setNameTarget({
            title: "Ganti nama file",
            hint: file.path,
            value: name(file.path),
            submit: (value) => {
              const moved = renameFile(key, value);
              closePreview(file.path);
              if (open === file.path) setOpen(moved.path);
              toast.success(`Nama file menjadi “${name(moved.path)}”.`);
            },
          }),
      },
      { icon: CopyPlus, label: "Duplikat", run: () => void duplicate(file) },
      {
        icon: FolderInput,
        label: "Pindahkan ke…",
        run: () =>
          setMoveTarget({
            title: "Pindahkan file",
            hint: file.path,
            from: parentOf(file.path),
            submit: (target) => {
              const moved = moveFile(key, target);
              closePreview(file.path);
              toast.success(`“${name(moved.path)}” dipindahkan ke ${relOf(parentOf(moved.path))}.`);
            },
          }),
      },
      {
        icon: Download,
        label: "Unduh",
        run: () =>
          void download(file).catch((error) => toast.error(messageOf(error))),
      },
      {
        icon: Trash2,
        label: "Hapus",
        danger: true,
        run: () =>
          setDeleteTarget({
            title: `Hapus ${name(file.path)}?`,
            detail: "File hilang dari File Manager. Riwayat chat dan checkpoint tetap utuh.",
            submit: () => {
              removeFile(key);
              closePreview(file.path);
              toast.success(`“${name(file.path)}” dihapus.`);
            },
          }),
      },
    );
    return actions;
  };

  const folderActions = (folder: FolderRow): Action[] => [
    {
      icon: PencilLine,
      label: "Ganti nama folder",
      run: () =>
        setNameTarget({
          title: "Ganti nama folder",
          hint: folder.path,
          value: folder.name,
          submit: (value) => {
            const moved = renameFolder(folder.path, value);
            if (dir === folder.path) setDir(parentOf(`${folder.path}/x`));
            toast.success(`Folder diganti jadi “${value.trim()}” (${moved} file).`);
          },
        }),
    },
    {
      icon: FolderInput,
      label: "Pindahkan ke…",
      run: () =>
        setMoveTarget({
          title: "Pindahkan folder",
          hint: folder.path,
          from: parentOf(folder.path),
          excluded: folder.path,
          submit: (target) => {
            const moved = moveFolder(folder.path, target);
            if (dir === folder.path) goToFolder(target);
            toast.success(`Folder “${folder.name}” dipindahkan (${moved} file).`);
          },
        }),
    },
    {
      icon: Trash2,
      label: "Hapus folder",
      danger: true,
      run: () =>
        setDeleteTarget({
          title: `Hapus folder ${folder.name}?`,
          detail: `${countUnder(folder.path)} file di dalamnya ikut dihapus dari File Manager.`,
          submit: () => {
            const removed = removeFolder(folder.path);
            if (dir.startsWith(`${folder.path}/`) || dir === folder.path) setDir(parentOf(folder.path));
            toast.success(`Folder “${folder.name}” dihapus (${removed} file).`);
          },
        }),
    },
  ];

  const previewActions = active ? fileActions(active) : [];

  return (
    <main className="h-dvh overflow-y-auto bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/88 backdrop-blur-xl">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
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
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Cari file, folder, atau isi file…"
              aria-label="Cari file"
              className="h-11 rounded-xl border-border/70 bg-card/60 pl-9 pr-10 text-sm"
            />
            {searching && (
              <Button
                variant="ghost"
                size="icon"
                title="Bersihkan pencarian"
                aria-label="Bersihkan pencarian"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-4 py-5">
        {searching ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {total === 0
                ? `Tidak ada yang cocok dengan “${q}”`
                : `${total} hasil untuk “${q}”${total > items.length ? ` · menampilkan ${items.length} teratas` : ""}`}
            </p>
            {folderHits.length > 0 && (
              <ul className="mb-3 overflow-hidden rounded-lg border border-border/70 bg-card/55">
                {folderHits.map((folder) => (
                  <li key={folder.path} className="border-b border-border/50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                      <RowButton
                        onClick={() => goToFolder(folder.path)}
                        icon={<Folder className="size-4 text-primary" />}
                        title={
                          <span className="font-mono text-xs">
                            <Highlight text={folder.label} query={q} />
                          </span>
                        }
                      />
                      <span className="shrink-0 px-2 text-[11px] text-muted-foreground">folder</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {items.length === 0 && folderHits.length === 0 ? (
              <p className="py-20 text-center text-sm text-muted-foreground">
                Coba kata kunci lain, atau tulis sebagian nama file.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
                {items.map((hit) => (
                  <li key={hit.file.path} className="border-b border-border/50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                      <RowButton
                        onClick={() => setOpen(hit.file.path)}
                        icon={<FileText className="size-4 text-primary" />}
                        title={
                          <Highlight text={name(hit.file.path)} query={q} />
                        }
                        meta={
                          <>
                            <Highlight text={hit.rel} query={q} />
                            {hit.file.size != null ? ` · ${formatSize(hit.file.size)}` : ""}
                          </>
                        }
                        trailing={
                          hit.snippet ? (
                            <span className="mt-1 hidden" />
                          ) : undefined
                        }
                      />
                      <RowMenu label={name(hit.file.path)} actions={fileActions(hit.file, true)} />
                    </div>
                    {hit.snippet && (
                      <p className="truncate px-3 pb-2.5 text-[11px] text-muted-foreground">
                        <Highlight text={hit.snippet} query={q} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex min-w-0 items-center gap-2">
            <nav className="flex min-w-0 flex-1 items-center overflow-x-auto text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setDir(ROOT)}
                className={`shrink-0 rounded py-1 pl-1.5 font-mono ${dir === ROOT ? "font-semibold text-foreground" : "hover:text-foreground"}`}
              >
                /files/home
              </button>
              {crumbs.map((crumb, index) => (
                <span key={crumb.path} className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setDir(crumb.path)}
                    className={`rounded py-1 font-mono ${index === crumbs.length - 1 ? "font-semibold text-foreground" : "hover:text-foreground"}`}
                  >
                    /{crumb.label}
                  </button>
                </span>
              ))}
            </nav>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 shrink-0 rounded-full px-3 text-xs">
                  <FolderPlus className="size-3.5" />
                  Baru
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44 rounded-xl">
                <DropdownMenuItem
                  onSelect={() =>
                    setNameTarget({
                      title: "Folder baru",
                      hint: dir.replace(ROOT, "/files/home"),
                      value: "",
                      submit: (value) => {
                        createFolder(dir, value);
                        toast.success(`Folder “${value.trim()}” dibuat.`);
                      },
                    })
                  }
                >
                  <FolderPlus className="size-4" />
                  Folder baru
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setNameTarget({
                      title: "File baru",
                      hint: dir.replace(ROOT, "/files/home"),
                      value: "",
                      submit: (value) => {
                        const file = createTextFile(dir, value);
                        toast.success(`File “${value.trim()}” dibuat.`);
                        setOpen(file.path);
                      },
                    })
                  }
                >
                  <FilePlus className="size-4" />
                  File baru
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
            {folders.length === 0 && dirFiles.length === 0 ? (
              <p className="py-20 text-center text-sm text-muted-foreground">
                {dir === ROOT ? "Belum ada file." : "Folder ini kosong."}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
                {folders.map((folder) => (
                  <li key={folder.path} className="border-b border-border/50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                      <RowButton
                        onClick={() => setDir(folder.path)}
                        icon={<Folder className="size-4 text-primary" />}
                        title={folder.name}
                        meta={folder.count ? `${folder.count} file` : "kosong"}
                        trailing={<ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      />
                      <RowMenu label={folder.name} actions={folderActions(folder)} />
                    </div>
                  </li>
                ))}
                {dirFiles.map((file) => (
                  <li key={file.path} className="border-b border-border/50 last:border-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                      <RowButton
                        onClick={() => setOpen(file.path)}
                        icon={<FileText className="size-4 text-primary" />}
                        title={name(file.path)}
                        meta={file.size != null ? formatSize(file.size) : undefined}
                      />
                      <RowMenu label={name(file.path)} actions={fileActions(file)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {active && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background/96 backdrop-blur-xl">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name(active.path)}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{active.path}</p>
            </div>
            <div className="flex items-center">
              {active.content && <CopyButton text={active.content} />}
              <Button
                variant="ghost"
                size="icon"
                title="Unduh file"
                aria-label="Unduh file"
                onClick={() =>
                  void download(active).catch((error) => toast.error(messageOf(error)))
                }
              >
                <Download className="size-4" />
              </Button>
              <RowMenu label={name(active.path)} actions={previewActions} />
              <Button
                variant="ghost"
                size="icon"
                title="Tutup"
                aria-label="Tutup pratinjau"
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

      <NameDialog
        open={nameTarget !== null}
        onOpenChange={(value) => {
          if (!value) setNameTarget(null);
        }}
        target={nameTarget}
      />
      <MoveDialog
        open={moveTarget !== null}
        onOpenChange={(value) => {
          if (!value) setMoveTarget(null);
        }}
        target={moveTarget}
      />
      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        target={deleteTarget}
      />
    </main>
  );
}
