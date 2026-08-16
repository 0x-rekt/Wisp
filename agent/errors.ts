export type WispErrorCode =
  | "auth"
  | "credits"
  | "rate_limit"
  | "unavailable"
  | "network"
  | "unknown";

export class WispError extends Error {
  readonly code: WispErrorCode;

  constructor(message: string, code: WispErrorCode) {
    super(message);
    this.name = "WispError";
    this.code = code;
  }
}

type ErrorLike = {
  statusCode?: number;
  status?: number;
  message?: string;
  code?: string;
};

export const classifyError = (error: unknown): WispError => {
  if (error instanceof WispError) return error;

  const e = error as ErrorLike;
  const status = e.statusCode ?? e.status;
  const rawMessage = e.message ?? String(error);

  if (status === 401) {
    return new WispError(
      "Invalid API key – run /auth to reconfigure your OpenRouter key.",
      "auth",
    );
  }
  if (status === 402) {
    return new WispError(
      "Out of credits – add credits at openrouter.ai/credits.",
      "credits",
    );
  }
  if (status === 429) {
    return new WispError(
      "Rate limited by OpenRouter – will retry with backoff.",
      "rate_limit",
    );
  }
  if (status === 503 || status === 502 || status === 504) {
    return new WispError(
      "OpenRouter is temporarily unavailable – will retry.",
      "unavailable",
    );
  }

  if (
    rawMessage.includes("ECONNREFUSED") ||
    rawMessage.includes("ENOTFOUND") ||
    rawMessage.includes("ETIMEDOUT") ||
    rawMessage.includes("fetch failed") ||
    rawMessage.includes("network") ||
    e.code === "ECONNRESET"
  ) {
    return new WispError(
      "Network error – check your connection and try again.",
      "network",
    );
  }

  return new WispError(rawMessage, "unknown");
};
