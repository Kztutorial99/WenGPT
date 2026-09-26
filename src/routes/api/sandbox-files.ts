import { createFileRoute } from "@tanstack/react-router";
import { Sandbox } from "e2b";
import { z } from "zod";
import { connectSandbox } from "@/lib/sandbox-pool.server";

const schema = z.object({ sandboxId: z.string().min(1).max(200) });

// Snapshot isi /home/user dalam satu perintah: folder + file teks kecil.
const SCRIPT = String.raw`python3 - <<'PY'
import os, json
root = "/home/user"
skip = {"node_modules", "__pycache__", "site-packages", ".git", ".cache", ".npm", ".local", ".config"}
dirs, files, total = [], [], 0
for cur, ds, fs in os.walk(root):
    ds[:] = sorted(d for d in ds if not d.startswith(".") and d not in skip)
    depth = cur[len(root):].count("/")
    if depth >= 6:
        ds[:] = []
    for d in ds:
        dirs.append(os.path.join(cur, d))
    for f in sorted(fs):
        if f.startswith(".") or len(files) >= 400:
            continue
        p = os.path.join(cur, f)
        try:
            size = os.path.getsize(p)
        except OSError:
            continue
        content, binary = "", False
        if size <= 200000 and total < 3000000:
            try:
                with open(p, "rb") as h:
                    raw = h.read()
                content = raw.decode("utf-8")
                total += size
            except Exception:
                binary = True
        else:
            binary = True
        files.append({"path": p, "size": size, "content": content, "binary": binary, "mtime": int(os.path.getmtime(p) * 1000)})
print(json.dumps({"dirs": dirs[:400], "files": files}))
PY`;

export const Route = createFileRoute("/api/sandbox-files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["E2B_API_KEY"];
        if (!apiKey) return Response.json({ error: "Sandbox belum siap." }, { status: 503 });
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
        try {
          const sb: Sandbox = await connectSandbox(parsed.data.sandboxId, apiKey);
          const r = await sb.commands.run(SCRIPT, { timeoutMs: 20_000 });
          return Response.json(JSON.parse(r.stdout));
        } catch {
          return Response.json({ error: "Sandbox sudah berakhir." }, { status: 410 });
        }
      },
    },
  },
});
