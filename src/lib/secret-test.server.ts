export type SecretTestResult = {
  status: "active" | "invalid" | "unknown" | "error";
  account?: string | undefined;
  detail?: string | undefined;
};

type Check = { url: string; headers: Record<string, string>; account: (j: any) => string | undefined };

function checkFor(service: string, token: string): Check | null {
  const bearer = { Authorization: `Bearer ${token}` };
  switch (service) {
    case "github":
      return {
        url: "https://api.github.com/user",
        headers: { ...bearer, Accept: "application/vnd.github+json", "User-Agent": "WenGPT" },
        account: (j) => j?.login,
      };
    case "vercel":
      return { url: "https://api.vercel.com/v2/user", headers: bearer, account: (j) => j?.user?.username ?? j?.user?.email };
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: bearer, account: () => "OpenAI API" };
    case "groq":
      return { url: "https://api.groq.com/openai/v1/models", headers: bearer, account: () => "Groq API" };
    case "openrouter":
      return { url: "https://openrouter.ai/api/v1/key", headers: bearer, account: (j) => j?.data?.label };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": token, "anthropic-version": "2023-06-01" },
        account: () => "Anthropic API",
      };
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(token)}`,
        headers: {},
        account: () => "Gemini API",
      };
    case "huggingface":
      return { url: "https://huggingface.co/api/whoami-v2", headers: bearer, account: (j) => j?.name };
    case "telegram":
      return {
        url: `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`,
        headers: {},
        account: (j) => (j?.result?.username ? `@${j.result.username}` : undefined),
      };
    case "stripe":
      return { url: "https://api.stripe.com/v1/balance", headers: bearer, account: (j) => (j?.livemode ? "Mode live" : "Mode test") };
    case "netlify":
      return { url: "https://api.netlify.com/api/v1/user", headers: bearer, account: (j) => j?.email };
    case "cloudflare":
      return { url: "https://api.cloudflare.com/client/v4/user/tokens/verify", headers: bearer, account: (j) => j?.result?.status };
    case "e2b":
      return { url: "https://api.e2b.dev/sandboxes", headers: { "X-API-KEY": token }, account: () => "E2B API" };
    default:
      return null;
  }
}

/** Menguji token ke layanan aslinya. Nilai token tidak pernah dikembalikan. */
export async function verifySecret(service: string, token: string): Promise<SecretTestResult> {
  const check = checkFor(service, token);
  if (!check) return { status: "unknown", detail: "Layanan ini belum bisa diuji otomatis." };
  try {
    const res = await fetch(check.url, { headers: check.headers, signal: AbortSignal.timeout(10_000) });
    const json = await res.json().catch(() => null);
    if (res.ok) return { status: "active", account: check.account(json) ?? undefined, detail: "Token valid dan aktif." };
    if (res.status === 401)
      return { status: "invalid", detail: `Ditolak layanan (HTTP ${res.status}). Token salah, kedaluwarsa, atau dicabut.` };
    if (res.status === 403 || res.status === 404)
      return { status: "error", detail: `Layanan membalas HTTP ${res.status}. Bisa karena izin token kurang, akses dibatasi, atau alamat pemeriksaan tidak tersedia.` };
    return { status: "error", detail: `Layanan membalas HTTP ${res.status}.` };
  } catch {
    return { status: "error", detail: "Layanan tidak bisa dihubungi. Coba lagi nanti." };
  }
}
