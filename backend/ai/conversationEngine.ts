import { AiInvalidResponseError, toAiError } from "./errors";
import { RESPOND_SCHEMA, validateStructuredResponse } from "./schema";
import { buildSystemPrompt } from "./systemPrompt";
import type { AiMessage, AiProvider } from "./types";
import type { StructuredAiResponse } from "./schema";

const MAX_VALIDATION_ATTEMPTS = 2;

/**
 * Runs one NEXUS conversation turn against a provider: sends the message
 * history with a forced structured-output tool, and validates the
 * result. If the provider's output fails our own validation (schema
 * adherence from a model is strong but never guaranteed), this retries
 * once with a corrective instruction before giving up.
 *
 * This is still "provider communication", not task orchestration — it
 * has no knowledge of Prisma or the Tasks/Messages tables. See
 * backend/services/conversationService.ts for what happens with the
 * result.
 */
export async function runConversationTurn(
  provider: AiProvider,
  history: AiMessage[],
): Promise<StructuredAiResponse> {
  const system = buildSystemPrompt();
  let messages = history;
  let lastValidationError: AiInvalidResponseError | null = null;

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    const result = await provider.chat<unknown>({
      system,
      messages,
      responseSchema: RESPOND_SCHEMA,
    });

    try {
      return validateStructuredResponse(result.parsed);
    } catch (err) {
      const aiErr = toAiError(err);
      if (!(aiErr instanceof AiInvalidResponseError)) throw aiErr;
      lastValidationError = aiErr;
      messages = [
        ...history,
        {
          role: "user",
          content:
            `[system note: your previous response did not match the required format — ${aiErr.message} ` +
            "Call the tool again with a corrected, fully valid response.]",
        },
      ];
    }
  }

  throw lastValidationError ?? new AiInvalidResponseError("The AI provider returned a malformed response.");
}
