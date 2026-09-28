import { createFileRoute } from "@tanstack/react-router";

// Cek ringan untuk indikator koneksi di navigasi atas.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, at: Date.now() }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
    },
  },
});
