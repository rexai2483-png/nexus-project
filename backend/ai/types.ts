/**
 * Provider-communication contract.
 *
 * This is the only surface task orchestration (backend/services/
 * conversationService.ts) is allowed to depend on — it never imports a
 * concrete provider SDK directly. Adding another cloud provider means
 * writing a new backend/ai/providers/*.ts that implements `AiProvider`;
 * nothing else needs to change.
 */

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiResponseSchema {
  /** Tool/function name the provider is forced to "call" to respond. */
  name: string;
  description: string;
  /** JSON Schema (draft 2020-12 subset) describing the required shape. */
  schema: Record<string, unknown>;
}

export interface AiChatRequest {
  system: string;
  messages: AiMessage[];
  responseSchema: AiResponseSchema;
  maxOutputTokens?: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiChatResult<T = unknown> {
  /** The validated-by-the-provider structured payload (parsed JSON). */
  parsed: T;
  usage: AiUsage | null;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  chat<T = unknown>(request: AiChatRequest): Promise<AiChatResult<T>>;
}
