import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { connectSandbox } from "@/lib/sandbox-pool.server";

const schema = z.object({
  sandboxId: z.string().min(1).max(200),
  dl: z.string().optional(),
  path: z.string().min(1).max(1000).startsWith("/home/user/"),
});

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", pdf: "application/pdf",
};

// Salurkan browser ke link unduhan langsung dari sandbox (tanpa batas ukuran server).
export const Route = createFileRoute("/api/sandbox-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = process.env["E2B_API_KEY"];
        if (!apiKey) return new Response("Sandbox belum siap.", { status: 503 });
        const q = Object.fromEntries(new URL(request.url).searchParams);
        const parsed = schema.safeParse(q);
        if (!parsed.success || parsed.data.path.includes("/../"))
          return new Response("Permintaan tidak valid.", { status: 400 });
        try {
          const sb = await connectSandbox(parsed.data.sandboxId, apiKey);
          const url = await sb.downloadUrl(parsed.data.path, { useSignatureExpiration: 3600 });
          const range = request.headers.get("range");
          const up = await fetch(url, { headers: range ? { Range: range } : {} });
          if (!up.ok && up.status !== 206) return new Response("File tidak ditemukan.", { status: 404 });
          const name = parsed.data.path.split("/").pop() ?? "file";
          const ext = name.split(".").pop()?.toLowerCase() ?? "";
          const type = TYPES[ext] ?? up.headers.get("content-type") ?? "application/octet-stream";
          const h = new Headers({ "Content-Type": type, "Cache-Control": "no-store", "Accept-Ranges": "bytes" });
          for (const k of ["content-length", "content-range"]) {
            const v = up.headers.get(k);
            if (v) h.set(k, v);
          }
          h.set(
            "Content-Disposition",
            `${parsed.data.dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
          );
          return new Response(up.body, { status: up.status, headers: h });
        } catch {
          return new Response("File tidak tersedia (sandbox sudah berakhir).", { status: 410 });
        }
      },
    },
  },
});

