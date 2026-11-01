import Anthropic from "@anthropic-ai/sdk";
import { AiError } from "../errors";
import type { AiChatRequest, AiChatResult, AiProvider } from "../types";

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

/**
 * Cloud provider adapter for Anthropic's Claude models.
 *
 * Configuration (see .env.example):
 * - AI_PROVIDER=anthropic (default)
 * - ANTHROPIC_API_KEY=sk-ant-...        (required — get one at https://console.anthropic.com/)
 * - AI_MODEL=claude-sonnet-5            (default; override with any current Claude model id)
 *
 * This is the only file that imports the Anthropic SDK. Everything else
 * in the app depends on the provider-agnostic `AiProvider` interface, so
 * adding another provider (e.g. OpenAI) means writing a sibling file
 * here and wiring it up in ../providerFactory.ts — no other code changes.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly defaultMaxOutputTokens: number;

  constructor(config: AnthropicProviderConfig) {
    this.model = config.model;
    this.defaultMaxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async chat<T = unknown>(request: AiChatRequest): Promise<AiChatResult<T>> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxOutputTokens ?? this.defaultMaxOutputTokens,
        system: request.system,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        tools: [
          {
            name: request.responseSchema.name,
            description: request.responseSchema.description,
            input_schema: request.responseSchema.schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: request.responseSchema.name },
      });
    } catch (err) {
      throw mapAnthropicError(err);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === request.responseSchema.name,
    );
    if (!toolUse) {
      throw new AiError(
        "INVALID_RESPONSE",
        "The AI provider finished without returning the required structured response.",
      );
    }

    return {
      parsed: toolUse.input as T,
      usage: response.usage
        ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        : null,
    };
  }
}

function mapAnthropicError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(
      "AUTH_ERROR",
      "The AI provider rejected the configured API key. Check ANTHROPIC_API_KEY in your .env file.",
      { cause: err },
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError(
      "RATE_LIMITED",
      "The AI provider is rate-limiting requests right now. Please try again shortly.",
      { cause: err },
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError(
      "NETWORK_ERROR",
      "Could not reach the AI provider. Check your network connection and try again.",
      { cause: err },
    );
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError("UNKNOWN", `The AI provider returned an error: ${err.message}`, { cause: err });
  }
  if (err instanceof Error) {
    return new AiError("UNKNOWN", err.message, { cause: err });
  }
  return new AiError("UNKNOWN", "An unknown error occurred while contacting the AI provider.");
}
