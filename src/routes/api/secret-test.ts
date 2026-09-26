import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifySecret } from "@/lib/secret-test.server";

const schema = z.object({
  name: z.string().max(64),
  service: z.string().max(40),
  value: z.string().min(1).max(8000),
});

export const Route = createFileRoute("/api/secret-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ status: "error", detail: "Permintaan tidak valid." }, { status: 400 });
        return Response.json(await verifySecret(parsed.data.service, parsed.data.value));
      },
    },
  },
});
