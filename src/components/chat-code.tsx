import { isValidElement, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Salin"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {done ? "Tersalin" : "Salin"}
    </button>
  );
}

export function CodeBox(props: Record<string, unknown>) {
  const children = props['children'] as ReactNode;
  const child = Array.isArray(children) ? children[0] : children;
  const cls = isValidElement(child) ? String((child.props as { className?: string }).className ?? "") : "";
  const lang = /language-([\w+-]+)/.exec(cls)?.[1] ?? "kode";
  const code = textOf(children).replace(/\n$/, "");
  return (
    <div className="wengpt-code my-3 min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1">
        <span className="font-mono text-[11px] text-muted-foreground">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-80 overflow-auto px-3 py-2.5 font-mono text-[12.5px] leading-5"><code>{code}</code></pre>
    </div>
  );
}
