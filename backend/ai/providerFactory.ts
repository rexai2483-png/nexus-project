import { AnthropicProvider } from "./providers/anthropic";
import { AiConfigurationError } from "./errors";
import type { AiProvider } from "./types";
import type { AiStatus } from "../../shared/types/models";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

function resolveProviderName(): string {
  return (process.env.AI_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
}

function resolveModel(providerName: string): string {
  if (process.env.AI_MODEL && process.env.AI_MODEL.trim()) {
    return process.env.AI_MODEL.trim();
  }
  switch (providerName) {
    case "anthropic":
      return DEFAULT_ANTHROPIC_MODEL;
    default:
      return "";
  }
}

/**
 * Reports whether an AI provider is usable, without ever constructing a
 * client or exposing the credential. Safe to call from an IPC handler —
 * this is exactly what `ai:getStatus` returns to the renderer.
 */
export function getAiStatus(): AiStatus {
  const provider = resolveProviderName();
  const model = resolveModel(provider);

  if (provider === "anthropic") {
    return { configured: Boolean(process.env.ANTHROPIC_API_KEY), provider, model };
  }
  return { configured: false, provider, model };
}

/**
 * Builds the configured AI provider. Throws AiConfigurationError (never a
 * raw/unclear error) if credentials are missing or the provider name is
 * unrecognized, so callers can show the user a clear, actionable message.
 */
export function createAiProvider(): AiProvider {
  const providerName = resolveProviderName();

  if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AiConfigurationError(
        "No AI provider is configured yet. Set ANTHROPIC_API_KEY in your .env file (see .env.example) and restart NEXUS.",
      );
    }
    return new AnthropicProvider({ apiKey, model: resolveModel(providerName) });
  }

  throw new AiConfigurationError(
    `Unknown AI_PROVIDER "${providerName}". Supported providers: anthropic.`,
  );
}
