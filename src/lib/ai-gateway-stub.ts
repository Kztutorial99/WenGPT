// Stub untuk @ai-sdk/gateway.
// Paket `ai` mengimpor modul ini, tetapi dist-nya memakai require("node:fs")
// yang tidak didukung Cloudflare Workers → seluruh SSR crash (error 500).
// WenGPT tidak pernah memakai Vercel AI Gateway (memakai openai-compatible
// dengan baseURL sendiri), jadi aman diganti stub. Jika suatu saat dipanggil,
// stub ini melempar error yang jelas.

class GatewayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GatewayError";
  }
  static isInstance(error: unknown): boolean {
    return error instanceof this;
  }
}
class GatewayAuthenticationError extends GatewayError {
  override name = "GatewayAuthenticationError";
}
class GatewayFailedDependencyError extends GatewayError {
  override name = "GatewayFailedDependencyError";
}
class GatewayForbiddenError extends GatewayError {
  override name = "GatewayForbiddenError";
}
class GatewayInternalServerError extends GatewayError {
  override name = "GatewayInternalServerError";
}
class GatewayInvalidRequestError extends GatewayError {
  override name = "GatewayInvalidRequestError";
}
class GatewayModelNotFoundError extends GatewayError {
  override name = "GatewayModelNotFoundError";
}
class GatewayNotFoundError extends GatewayError {
  override name = "GatewayNotFoundError";
}
class GatewayRateLimitError extends GatewayError {
  override name = "GatewayRateLimitError";
}
class GatewayResponseError extends GatewayError {
  override name = "GatewayResponseError";
}

const notConfigured = (): never => {
  throw new GatewayError(
    "Vercel AI Gateway tidak dipakai di WenGPT (stub aktif). Gunakan AI_BASE_URL/AI_API_KEY.",
  );
};

const GATEWAY_AUTH_SUBPROTOCOL_PREFIX = "gateway-auth";
const GATEWAY_REALTIME_SUBPROTOCOL = "gateway-realtime";
const GATEWAY_TEAM_SUBPROTOCOL_PREFIX = "gateway-team";
const GATEWAY_TRANSCRIPTION_SUBPROTOCOL = "gateway-transcription";
const VERSION = "0.0.0-stub";

const createGateway = notConfigured;
const createGatewayProvider = notConfigured;
const gateway = new Proxy({} as Record<string, unknown>, {
  get: notConfigured,
});
const getGatewayRealtimeAuthToken = notConfigured;
const getGatewayRealtimeProtocols = () => [];
const getGatewayRealtimeTeamIdOrSlug = () => undefined;
const getGatewayTranscriptionProtocols = () => [];

export {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_REALTIME_SUBPROTOCOL,
  GATEWAY_TEAM_SUBPROTOCOL_PREFIX,
  GATEWAY_TRANSCRIPTION_SUBPROTOCOL,
  GatewayAuthenticationError,
  GatewayError,
  GatewayFailedDependencyError,
  GatewayForbiddenError,
  GatewayInternalServerError,
  GatewayInvalidRequestError,
  GatewayModelNotFoundError,
  GatewayNotFoundError,
  GatewayRateLimitError,
  GatewayResponseError,
  VERSION,
  createGateway,
  createGatewayProvider,
  gateway,
  getGatewayRealtimeAuthToken,
  getGatewayRealtimeProtocols,
  getGatewayRealtimeTeamIdOrSlug,
  getGatewayTranscriptionProtocols,
};
