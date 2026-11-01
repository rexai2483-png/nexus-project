import type { AiErrorCode, AiErrorInfo } from "../../shared/types/models";

export type { AiErrorCode };

/**
 * A normalized error from anywhere in the AI stack: provider
 * configuration, network/transport, the provider's own API, or our own
 * validation of what the provider returned. Provider adapters
 * (backend/ai/providers/*) are responsible for translating
 * provider-specific errors into this shape — orchestration code
 * (backend/services/conversationService.ts) only ever has to handle one
 * error type.
 */
export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "AiError";
  }

  /** The safe, user-facing shape sent across IPC — never includes `cause`. */
  toInfo(): AiErrorInfo {
    return { code: this.code, message: this.message };
  }
}

export class AiConfigurationError extends AiError {
  constructor(message: string) {
    super("NOT_CONFIGURED", message);
    this.name = "AiConfigurationError";
  }
}

export class AiInvalidResponseError extends AiError {
  constructor(message: string) {
    super("INVALID_RESPONSE", message);
    this.name = "AiInvalidResponseError";
  }
}

/** Normalizes any thrown value (including non-Error throws) into an AiError. */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Error) return new AiError("UNKNOWN", err.message, { cause: err });
  return new AiError("UNKNOWN", "An unknown error occurred while contacting the AI provider.");
}
