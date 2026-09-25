import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

const SYSTEM_PROMPT = `/no_think
You are Foundry, an AI web app builder.

The user describes an app. You reply with:
1. One or two short sentences describing what you built (plain language).
2. Exactly one fenced code block tagged \`html\` containing a COMPLETE, self-contained, single-file web app.

Rules for the code block:
- Full document: <!doctype html>, <html>, <head>, <body>.
- All CSS in a <style> tag and all JS in a <script> tag inside the same file.
- You may use CDN scripts (https://cdn.tailwindcss.com, https://unpkg.com/...) but nothing that needs a build step or server.
- No external local files, no imports of local paths, no placeholder TODOs.
- Make it look genuinely good: considered typography, spacing, color and motion.
- It must run standalone inside a sandboxed iframe.

When the user asks for a change, output the FULL updated file again, never a diff.
Never wrap the explanation in code fences. Never output more than one code block.`;

// The "address book": the Kaggle notebook reports its current tunnel URL to a
// tiny free Redis (Upstash REST) every time it restarts. We read the freshest
// URL from there on every chat request, so the app survives tunnel restarts
// with no manual config changes. Falls back to the static AI_BASE_URL secret.
// Several Kaggle accounts each report their own key; the first live one wins.
const REGISTRY_KEYS = ["foundry:ai-url:1", "foundry:ai-url:2", "foundry:ai-url:3", "foundry:ai-url"];

const withV1 = (u: string) => {
  const base = u.replace(/\/+$/, "");
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
};

async function isAlive(v1Base: string): Promise<boolean> {
  try {
    const res = await fetch(`${v1Base}/models`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Cache the resolved URL for a short time so each message doesn't wait on
// registry + health checks before the model even starts.
let cachedUrl: { url: string; at: number } | null = null;
const CACHE_MS = 60_000;

async function resolveAiBaseUrl(): Promise<string> {
  if (cachedUrl && Date.now() - cachedUrl.at < CACHE_MS) return cachedUrl.url;
  const url = await resolveAiBaseUrlUncached();
  cachedUrl = { url, at: Date.now() };
  return url;
}

async function resolveAiBaseUrlUncached(): Promise<string> {
  const fallback = withV1(process.env["AI_BASE_URL"] || "https://api.openai.com/v1");
  const regUrl = process.env["AI_REGISTRY_URL"];
  const regToken = process.env["AI_REGISTRY_TOKEN"];
  if (!regUrl || !regToken) return fallback;

  try {
    const path = REGISTRY_KEYS.map(encodeURIComponent).join("/");
    const res = await fetch(`${regUrl.replace(/\/+$/, "")}/mget/${path}`, {
      headers: { Authorization: `Bearer ${regToken}` },
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as { result?: (string | null)[] };
    const candidates = [...new Set((data.result ?? []).filter((u): u is string => !!u).map(withV1))];
    if (candidates.length) {
      // Check all at once; pick the first account (in order) that answers.
      const alive = await Promise.all(candidates.map(isAlive));
      const idx = alive.indexOf(true);
      return candidates[idx >= 0 ? idx : 0] ?? fallback;
    }
  } catch {
    // Registry unreachable — use the static URL instead.
  }
  return fallback;
}


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["AI_API_KEY"];
        if (!apiKey) {
          return new Response(
            "AI_API_KEY is not configured yet. Add your provider API key in project settings.",
            { status: 500 },
          );
        }

        const { messages } = (await request.json()) as { messages: UIMessage[] };

        const baseURL = await resolveAiBaseUrl();


        const provider = createOpenAI({ apiKey, baseURL });

        const model = process.env["AI_MODEL"] || "gpt-4o-mini";

        const result = streamText({
          model: provider.chat(model),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          // Ollama: turn off Qwen3 "thinking" (long hidden reasoning before any text)
          providerOptions: { openai: { reasoningEffort: "none" as never } },
        });

        // Stream via fullStream so a provider failure surfaces as an explicit
        // error part (textStream silently ends empty on connection errors).
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const part of result.fullStream) {
                if (part.type === "text-delta") {
                  controller.enqueue(encoder.encode(part.text));
                } else if (part.type === "error") {
                  const reason =
                    part.error instanceof Error ? part.error.message : String(part.error);
                  controller.enqueue(
                    encoder.encode(
                      `\n\n**Could not reach your AI server.** ${reason}\n\nCheck that the model server is running and the tunnel address is alive.`,
                    ),
                  );
                  cachedUrl = null; // force re-resolve next time
                  break;
                }
              }
            } catch (error) {
              const reason = error instanceof Error ? error.message : "Unknown error";
              controller.enqueue(
                encoder.encode(
                  `\n\n**Could not reach your AI server.** ${reason}\n\nCheck that the model server is running and the address is reachable.`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        });


        return new Response(stream, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
