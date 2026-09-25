export type ToolOut = { exitCode?: number; stdout?: string; stderr?: string; ok?: boolean; error?: string; path?: string };
export type Run = { id: string; name: string; input: { command?: string; path?: string; content?: string }; output?: ToolOut };
export type Checkpoint = { id: string; ask: string; runs: Run[] };
export type SavedFile = { path: string; content: string; runId: string; ask: string; failed: boolean };

type Stored = { messages?: { id: string; role: string; parts?: ({ type: "text"; text: string } | { type: "tool"; run: Run })[] }[] };

function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem("wengpt:chat") || "{}");
  } catch {
    return {};
  }
}

/** One checkpoint per user prompt, containing the tools run for that prompt. */
export function loadCheckpoints(): Checkpoint[] {
  const list: Checkpoint[] = [];
  let current: Checkpoint | null = null;
  for (const m of read().messages ?? []) {
    if (m.role === "user") {
      const text = m.parts?.find((p) => p.type === "text");
      current = { id: m.id, ask: text && text.type === "text" ? text.text : "", runs: [] };
      list.push(current);
      continue;
    }
    for (const p of m.parts ?? []) if (p.type === "tool" && current) current.runs.push(p.run);
  }
  return list.filter((c) => c.runs.length > 0);
}

export function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/home/user/${path}`;
}

/** Files created by the assistant, latest version per path. */
export function loadFiles(): SavedFile[] {
  const map = new Map<string, SavedFile>();
  for (const c of loadCheckpoints()) {
    for (const r of c.runs) {
      if (r.name !== "write_file" || !r.input.path) continue;
      const path = normalizePath(r.input.path);
      map.delete(path);
      map.set(path, { path, content: String(r.input.content ?? ""), runId: r.id, ask: c.ask, failed: r.output?.ok === false });
    }
  }
  return [...map.values()].reverse();
}
