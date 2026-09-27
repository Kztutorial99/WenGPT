import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { connectSandbox } from "@/lib/sandbox-pool.server";

const schema = z.object({
  sandboxId: z.string().min(1).max(200),
  path: z.string().min(1).max(1000).startsWith("/home/user/"),
});

// Arahkan browser ke link unduhan langsung dari sandbox (tanpa batas ukuran server).
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
          return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
        } catch {
          return new Response("File tidak tersedia (sandbox sudah berakhir).", { status: 410 });
        }
      },
    },
  },
});

