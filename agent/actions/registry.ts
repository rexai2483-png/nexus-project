import type { AgentActionType } from "../../shared/types/agentActions";
import { AGENT_ACTION_CATALOG } from "../../shared/types/agentActions";
import type { AgentActionResult } from "../../shared/types/agentProtocol";

/**
 * The central action registry. Every capability the agent exposes must
 * be registered here through `registerAction()` — nothing else can run.
 * This is the concrete implementation of "every action passes through a
 * centralized registry" and "only explicitly registered actions may
 * run": `executeAction()` never evaluates a string as code, never
 * shells out to an AI-supplied command, and refuses any `type` that
 * isn't both in the shared catalog AND has a registered handler.
 */

export interface ActionContext {
  signal: AbortSignal;
}

export type ActionHandler = (
  parameters: Record<string, unknown>,
  context: ActionContext,
) => Promise<unknown>;

const handlers = new Map<AgentActionType, ActionHandler>();

export function registerAction(type: AgentActionType, handler: ActionHandler): void {
  if (handlers.has(type)) {
    throw new Error(`Action "${type}" is already registered.`);
  }
  handlers.set(type, handler);
}

export class ActionValidationError extends Error {}
export class UnsupportedPlatformError extends Error {}
class TimeoutError extends Error {}

function validateParameters(type: AgentActionType, parameters: Record<string, unknown>): void {
  const definition = AGENT_ACTION_CATALOG[type];
  for (const field of definition.params) {
    const value = parameters[field.name];
    if (field.required && (value === undefined || value === null)) {
      throw new ActionValidationError(`Missing required parameter "${field.name}".`);
    }
    if (value === undefined || value === null) continue;
    if (field.type === "string" && typeof value !== "string") {
      throw new ActionValidationError(`Parameter "${field.name}" must be a string.`);
    }
    if (field.type === "number" && typeof value !== "number") {
      throw new ActionValidationError(`Parameter "${field.name}" must be a number.`);
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      throw new ActionValidationError(`Parameter "${field.name}" must be a boolean.`);
    }
  }
  const allowedNames = new Set(definition.params.map((field) => field.name));
  for (const key of Object.keys(parameters)) {
    if (!allowedNames.has(key)) {
      throw new ActionValidationError(`Unknown parameter "${key}" for action "${type}".`);
    }
  }
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${timeoutMs}ms.`)), timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Action aborted."));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Validates and executes one action end-to-end, always returning a
 * structured result — this function never throws. The agent's IPC
 * server (agent/ipc/server.ts) calls this for every `action.submit`
 * message; nothing else is allowed to invoke a handler directly.
 */
export async function executeAction(
  type: string,
  parameters: Record<string, unknown>,
  signal: AbortSignal,
): Promise<AgentActionResult> {
  const definition = AGENT_ACTION_CATALOG[type as AgentActionType] as
    | (typeof AGENT_ACTION_CATALOG)[AgentActionType]
    | undefined;
  if (!definition) {
    return { ok: false, errorCode: "UNKNOWN_ACTION", message: `"${type}" is not a registered action type.` };
  }

  try {
    validateParameters(definition.type, parameters);
  } catch (err) {
    return {
      ok: false,
      errorCode: "VALIDATION_ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const handler = handlers.get(definition.type);
  if (!handler) {
    return { ok: false, errorCode: "UNKNOWN_ACTION", message: `Action "${type}" has no registered handler.` };
  }

  try {
    const data = await runWithTimeout(handler(parameters, { signal }), definition.timeoutMs, signal);
    return { ok: true, data };
  } catch (err) {
    if (signal.aborted) {
      return { ok: false, errorCode: "CANCELLED", message: "The action was cancelled before it completed." };
    }
    if (err instanceof TimeoutError) {
      return { ok: false, errorCode: "TIMEOUT", message: err.message };
    }
    if (err instanceof UnsupportedPlatformError) {
      return { ok: false, errorCode: "UNSUPPORTED_PLATFORM", message: err.message };
    }
    return {
      ok: false,
      errorCode: "EXECUTION_ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
