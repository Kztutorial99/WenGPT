import { createFileRoute } from "@tanstack/react-router";
import { Sandbox } from "e2b";
import { z } from "zod";
import { connectSandbox, dropSandbox } from "@/lib/sandbox-pool.server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    sandboxId: z.string().max(200).nullable().optional(),
    pid: z.number().int().positive().nullable().optional(),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(4).max(300),
  }),
  z.object({
    action: z.literal("input"),
    sandboxId: z.string().min(1).max(200),
    pid: z.number().int().positive(),
    data: z.string().max(64_000),
  }),
  z.object({
    action: z.literal("resize"),
    sandboxId: z.string().min(1).max(200),
    pid: z.number().int().positive(),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(4).max(300),
  }),
]);

const opts = (apiKey: string) => ({ apiKey, timeoutMs: 15 * 60_000 });

export const Route = createFileRoute("/api/terminal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["E2B_API_KEY"];
        if (!apiKey) return Response.json({ error: "Sandbox belum siap." }, { status: 503 });
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
        const body = parsed.data;

        if (body.action !== "open") {
          const run = async () => {
            const sb = await connectSandbox(body.sandboxId, apiKey);
            if (body.action === "input")
              await sb.pty.sendInput(body.pid, new TextEncoder().encode(body.data));
            else await sb.pty.resize(body.pid, { cols: body.cols, rows: body.rows });
          };
          try {
            await run().catch(async () => {
              dropSandbox(body.sandboxId);
              await run();
            });
            return Response.json({ ok: true });
          } catch (error) {
            return Response.json(
              { error: error instanceof Error ? error.message : "Terminal terputus." },
              { status: 410 },
            );
          }
        }

        const encoder = new TextEncoder();
        let closed = false;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: Record<string, unknown>) => {
              if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            };
            const onData = (data: Uint8Array) =>
              send({ t: "data", v: Buffer.from(data).toString("base64") });
            try {
              let sb: Sandbox | null = null;
              let fresh = false;
              if (body.sandboxId) {
                try {
                  sb = await Sandbox.connect(body.sandboxId, opts(apiKey));
                } catch {
                  sb = null;
                }
              }
              if (!sb) {
                sb = await Sandbox.create(opts(apiKey));
                fresh = true;
              }
              send({ t: "sandbox", id: sb.sandboxId, fresh });
              let handle = null;
              if (body.pid && !fresh) {
                try {
                  handle = await sb.pty.connect(body.pid, { onData, timeoutMs: 0 });
                } catch {
                  handle = null;
                }
              }
              if (!handle) {
                // Pastikan folder kerja milik user supaya mkdir/touch tidak "Permission denied".
                await sb.commands
                  .run(
                    "mkdir -p /home/user && chown user:user /home/user && find /home/user -xdev ! -user user -exec chown -h user:user {} + 2>/dev/null; true",
                    { user: "root", timeoutMs: 20_000 },
                  )
                  .catch(() => {});
                handle = await sb.pty.create({
                  cols: body.cols,
                  rows: body.rows,
                  onData,
                  timeoutMs: 0,
                  cwd: "/home/user",
                  user: "user",
                  envs: { TERM: "xterm-256color", HOME: "/home/user" },
                });
              }
              send({ t: "pid", pid: handle.pid });
              request.signal.addEventListener("abort", () => {
                closed = true;
                void handle?.disconnect().catch(() => {});
              });
              const result = await handle.wait().catch(() => null);
              send({ t: "exit", code: result?.exitCode ?? 0 });
            } catch (error) {
              send({ t: "error", v: error instanceof Error ? error.message : "Terminal gagal." });
            } finally {
              if (!closed) {
                closed = true;
                controller.close();
              }
            }
          },
          cancel() {
            closed = true;
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
