import {
  Braces,
  Database,
  File,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
} from "lucide-react";

const LABELS: Record<string, string> = {
  py: "PY",
  js: "JS",
  jsx: "JSX",
  ts: "TS",
  tsx: "TSX",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "H++",
  c: "C",
  h: "H",
  java: "JV",
  kt: "KT",
  rs: "RS",
  go: "GO",
  html: "HTML",
  css: "CSS",
  md: "MD",
  sh: "SH",
  rb: "RB",
  php: "PHP",
  cs: "C#",
  swift: "SW",
  vue: "VUE",
  svelte: "SV",
  yml: "YML",
  yaml: "YML",
  toml: "TOML",
};

/** Ikon file sesuai ekstensi (Python, JS, TS, C++, JSON, SQL, dst); ikon umum untuk yang tidak dikenal. */
export function FileIcon({ path, className = "size-4" }: { path: string; className?: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return <Braces className={`${className} text-primary`} aria-label="JSON" />;
  if (ext === "sql" || ext === "db" || ext === "sqlite")
    return <Database className={`${className} text-primary`} aria-label="Database" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext))
    return <FileImage className={className} aria-label="Gambar" />;
  if (["mp4", "webm", "mov", "mkv"].includes(ext))
    return <FileVideo className={className} aria-label="Video" />;
  if (ext === "txt" || ext === "log") return <FileText className={className} aria-label="Teks" />;
  const label = LABELS[ext];
  if (!label) return <File className={className} aria-label="File" />;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      aria-label={label}
    >
      <FileCode2 className="size-full text-primary" />
      <span className="absolute -bottom-1 -right-1.5 rounded-sm bg-primary px-0.5 font-mono text-[7px] font-bold leading-none text-primary-foreground">
        {label}
      </span>
    </span>
  );
}

export function FolderIcon({
  open = false,
  className = "size-4",
}: {
  open?: boolean;
  className?: string;
}) {
  return open ? (
    <FolderOpen className={`${className} text-primary`} />
  ) : (
    <Folder className={`${className} text-primary`} />
  );
}
