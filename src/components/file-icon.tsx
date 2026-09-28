import { Braces, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder, FolderOpen } from "lucide-react";
import type { IconType } from "react-icons";
import {
  SiC, SiCplusplus, SiCss, SiDart, SiDocker, SiDotnet, SiGit, SiGnubash, SiGo, SiHtml5, SiJavascript,
  SiKotlin, SiLua, SiMarkdown, SiOpenjdk, SiPhp, SiPostgresql, SiPython, SiReact, SiRuby, SiRust,
  SiSqlite, SiSvelte, SiSwift, SiToml, SiTypescript, SiVuedotjs, SiYaml,
} from "react-icons/si";

// Ikon & warna resmi tiap bahasa (warna brand, sengaja tidak memakai token tema).
const BRAND: Record<string, [IconType, string, string]> = {
  py: [SiPython, "#3776AB", "Python"],
  js: [SiJavascript, "#F7DF1E", "JavaScript"], mjs: [SiJavascript, "#F7DF1E", "JavaScript"], cjs: [SiJavascript, "#F7DF1E", "JavaScript"],
  ts: [SiTypescript, "#3178C6", "TypeScript"],
  jsx: [SiReact, "#61DAFB", "React"], tsx: [SiReact, "#61DAFB", "React"],
  cpp: [SiCplusplus, "#00599C", "C++"], cc: [SiCplusplus, "#00599C", "C++"], cxx: [SiCplusplus, "#00599C", "C++"], hpp: [SiCplusplus, "#00599C", "C++"],
  c: [SiC, "#A8B9CC", "C"], h: [SiC, "#A8B9CC", "C"],
  java: [SiOpenjdk, "#E76F00", "Java"], kt: [SiKotlin, "#7F52FF", "Kotlin"],
  rs: [SiRust, "#DEA584", "Rust"], go: [SiGo, "#00ADD8", "Go"],
  html: [SiHtml5, "#E34F26", "HTML"], htm: [SiHtml5, "#E34F26", "HTML"],
  css: [SiCss, "#1572B6", "CSS"], md: [SiMarkdown, "#8A8A8A", "Markdown"],
  sh: [SiGnubash, "#4EAA25", "Bash"], bash: [SiGnubash, "#4EAA25", "Bash"],
  rb: [SiRuby, "#CC342D", "Ruby"], php: [SiPhp, "#777BB4", "PHP"], cs: [SiDotnet, "#512BD4", "C#"],
  swift: [SiSwift, "#F05138", "Swift"], vue: [SiVuedotjs, "#4FC08D", "Vue"], svelte: [SiSvelte, "#FF3E00", "Svelte"],
  yml: [SiYaml, "#CB171E", "YAML"], yaml: [SiYaml, "#CB171E", "YAML"], toml: [SiToml, "#9C4121", "TOML"],
  sql: [SiPostgresql, "#4169E1", "SQL"], db: [SiSqlite, "#003B57", "SQLite"], sqlite: [SiSqlite, "#003B57", "SQLite"],
  dart: [SiDart, "#0175C2", "Dart"], lua: [SiLua, "#2C2D72", "Lua"],
};

/** Ikon file asli sesuai bahasa/tipe (Python, JS, C++, dst). */
export function FileIcon({ path, className = "size-4" }: { path: string; className?: string }) {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  if (name === "dockerfile") return <SiDocker className={className} color="#2496ED" aria-label="Docker" />;
  if (name === ".gitignore") return <SiGit className={className} color="#F05032" aria-label="Git" />;
  const brand = BRAND[ext];
  if (brand) {
    const [Icon, color, label] = brand;
    return <Icon className={`shrink-0 ${className}`} color={color} aria-label={label} />;
  }
  if (ext === "json") return <Braces className={className} color="#CBCB41" aria-label="JSON" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"].includes(ext))
    return <FileImage className={className} color="#26A69A" aria-label="Gambar" />;
  if (["mp4", "webm", "mov", "mkv", "avi"].includes(ext))
    return <FileVideo className={className} color="#EF5350" aria-label="Video" />;
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext))
    return <FileAudio className={className} color="#AB47BC" aria-label="Audio" />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return <FileArchive className={className} color="#AFB42B" aria-label="Arsip" />;
  if (ext === "pdf") return <FileText className={className} color="#E53935" aria-label="PDF" />;
  if (ext === "txt" || ext === "log") return <FileText className={className} aria-label="Teks" />;
  return <File className={className} aria-label="File" />;
}

export function FolderIcon({ open = false, className = "size-4" }: { open?: boolean; className?: string }) {
  return open ? <FolderOpen className={`${className} text-primary`} /> : <Folder className={`${className} text-primary`} />;
}
