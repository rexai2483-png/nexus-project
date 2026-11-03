import { AiInvalidResponseError } from "./errors";
import type { AiResponseSchema } from "./types";

/**
 * The single structured response every NEXUS conversation turn produces.
 *
 * Rather than parsing free-form AI text, every provider call forces a
 * tool/function call matching this schema (see backend/ai/providers/
 * anthropic.ts), and the result is validated again here at runtime
 * before anything is persisted or shown to the user. Schema adherence
 * from the provider is strong but not a guarantee — this module is the
 * actual trust boundary.
 */

export const RESPOND_TOOL_NAME = "respond_to_user";

export const RESPOND_SCHEMA: AiResponseSchema = {
  name: RESPOND_TOOL_NAME,
  description:
    "Respond to the user's latest message in an ongoing NEXUS conversation. " +
    "Always classify the message and always provide a reply. Only include " +
    "`plan` when intent is TASK or SENSITIVE.",
  schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["CONVERSATION", "TASK", "CLARIFICATION", "SENSITIVE"],
        description:
          "CONVERSATION: general chat, no computer action requested. " +
          "TASK: a concrete computer task the user wants carried out. " +
          "CLARIFICATION: the request is ambiguous and must be clarified before it can be planned. " +
          "SENSITIVE: a computer task that touches something risky (deleting data, sending " +
          "messages/payments, security/account settings, irreversible actions, etc.).",
      },
      reply: {
        type: "string",
        description:
          "What NEXUS says back to the user. For TASK/SENSITIVE this must explain, in plain " +
          "language, what NEXUS intends to do BEFORE any of it happens — NEXUS never implies the " +
          "task has started or finished, because it has not executed anything.",
      },
      plan: {
        type: "object",
        description: "Required when intent is TASK or SENSITIVE; omitted otherwise.",
        properties: {
          title: { type: "string", description: "Short task title, under 80 characters." },
          objective: { type: "string", description: "One or two sentences: what success looks like." },
          steps: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                requiresApproval: {
                  type: "boolean",
                  description: "True if this specific step should require explicit user approval before NEXUS may ever act on it.",
                },
              },
              required: ["description", "requiresApproval"],
            },
          },
          requiredResources: {
            type: "array",
            items: { type: "string" },
            description: "Applications, accounts, files, or other resources the task needs.",
          },
          risks: {
            type: "array",
            items: { type: "string" },
            description: "Concrete risks or things that could go wrong. Empty array if genuinely none.",
          },
          completionCriteria: {
            type: "string",
            description: "How NEXUS (or the user) would know the task is actually complete.",
          },
        },
        required: ["title", "objective", "steps", "requiredResources", "risks", "completionCriteria"],
      },
    },
    required: ["intent", "reply"],
  },
};

export type StructuredIntent = "CONVERSATION" | "TASK" | "CLARIFICATION" | "SENSITIVE";

export interface StructuredPlanStep {
  description: string;
  requiresApproval: boolean;
}

export interface StructuredPlan {
  title: string;
  objective: string;
  steps: StructuredPlanStep[];
  requiredResources: string[];
  risks: string[];
  completionCriteria: string;
}

export interface StructuredAiResponse {
  intent: StructuredIntent;
  reply: string;
  plan?: StructuredPlan;
}

const VALID_INTENTS: StructuredIntent[] = ["CONVERSATION", "TASK", "CLARIFICATION", "SENSITIVE"];

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AiInvalidResponseError(`AI response field "${field}" must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new AiInvalidResponseError(`AI response field "${field}" must be an array of strings.`);
  }
  return value;
}

function validatePlan(value: unknown): StructuredPlan {
  if (typeof value !== "object" || value === null) {
    throw new AiInvalidResponseError(
      'AI response declared a TASK/SENSITIVE intent but omitted the required "plan" object.',
    );
  }
  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new AiInvalidResponseError('AI response field "plan.steps" must be a non-empty array.');
  }
  const steps = obj.steps.map((step, index): StructuredPlanStep => {
    if (typeof step !== "object" || step === null) {
      throw new AiInvalidResponseError(`AI response field "plan.steps[${index}]" must be an object.`);
    }
    const s = step as Record<string, unknown>;
    return {
      description: requireString(s.description, `plan.steps[${index}].description`),
      requiresApproval: typeof s.requiresApproval === "boolean" ? s.requiresApproval : false,
    };
  });

  return {
    title: requireString(obj.title, "plan.title"),
    objective: requireString(obj.objective, "plan.objective"),
    steps,
    requiredResources: requireStringArray(obj.requiredResources, "plan.requiredResources"),
    risks: requireStringArray(obj.risks, "plan.risks"),
    completionCriteria: requireString(obj.completionCriteria, "plan.completionCriteria"),
  };
}

/** Validates the parsed tool-call payload. Throws AiInvalidResponseError on any shape mismatch. */
export function validateStructuredResponse(data: unknown): StructuredAiResponse {
  if (typeof data !== "object" || data === null) {
    throw new AiInvalidResponseError("AI response was not a JSON object.");
  }
  const obj = data as Record<string, unknown>;

  const intent = obj.intent;
  if (typeof intent !== "string" || !VALID_INTENTS.includes(intent as StructuredIntent)) {
    throw new AiInvalidResponseError(
      `AI response field "intent" must be one of ${VALID_INTENTS.join(", ")}.`,
    );
  }
  const reply = requireString(obj.reply, "reply");

  const needsPlan = intent === "TASK" || intent === "SENSITIVE";
  const plan = needsPlan ? validatePlan(obj.plan) : undefined;

  return { intent: intent as StructuredIntent, reply, plan };
}
