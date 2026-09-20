import { ProviderAdmissionError, retryAfterMs, withAdmissionRetry } from "./provider-retry";
import { withProviderSlot, type ProviderTaskOptions } from "./provider-concurrency";
import { educationOutputSchema, parseEducationOutput } from "./education-contract";
import "server-only";

import type { ChallengeModeDefinition } from "./challenge-modes";
import { resolveChallengeEvaluationModel } from "./model-options";
import {
  buildOpenRouterMessages,
  openRouterReasoningOptions,
  type OpenRouterMessage,
} from "./openrouter-contract";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "qwen/qwen3.5-9b";
const defaultConcurrency = 20;
const requestTimeoutMs = 60000;

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function shouldUseRealLlm() {
  return process.env.USE_REAL_LLM === "true";
}

export function getOpenRouterModel() {
  return process.env.OPENROUTER_MODEL || defaultModel;
}

export function resolveOpenRouterModel(challengeModel?: string | null) {
  return resolveChallengeEvaluationModel(challengeModel, getOpenRouterModel());
}

export function getOpenRouterConcurrency() {
  const parsed = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || "", 10);

  if (!Number.isFinite(parsed)) {
    return defaultConcurrency;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

// Bound each submission independently of the process-wide provider ceiling.
export function getOpenRouterSubmissionConcurrency() {
  return Math.min(getOpenRouterConcurrency(), 20);
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

async function extractReportRequest({
  prompt,
  reportText,
  model,
  mode,
  signal,
}: {
  prompt: string;
  reportText: string;
  model?: string;
  mode?: ChallengeModeDefinition;
  signal?: AbortSignal;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when USE_REAL_LLM=true.");
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  const messages: OpenRouterMessage[] = buildOpenRouterMessages({
    prompt,
    reportText,
    mode,
  });

  let response: Response;

  try {
    response = await fetch(openRouterUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || getOpenRouterModel(),
        messages,
        ...openRouterReasoningOptions(model || getOpenRouterModel()),
        temperature: 0,
        max_tokens: mode?.education ? Math.min(8192, 256 + mode.fields.length * 96) : 300,
        ...(mode?.education ? { response_format: { type: "json_schema", json_schema: { name: "clinical_decisions", strict: true, schema: educationOutputSchema(mode) } }, provider: { require_parameters: true } } : {}),
      }),
    });
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel();
      throw new ProviderAdmissionError(retryAfterMs(response.headers.get("retry-after")));
    }
    if (response.status === 402) {
      const body = await response.json().catch(() => null);
      const metadata = body?.error?.metadata;
      if (metadata?.limit_source === "openrouter_in_flight_budget" && metadata?.reason === "in_flight_budget_exhausted" && retryAfterMs(response.headers.get("retry-after")) !== null) {
        throw new ProviderAdmissionError(retryAfterMs(response.headers.get("retry-after")));
      }
    }
    throw new Error(
      `OpenRouter request failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content?.trim()) {
    throw new Error("OpenRouter returned an empty model output.");
  }

  if (mode?.education) parseEducationOutput(content, mode);
  return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(signal?.aborted ? "Evaluation cancelled." : "OpenRouter request timed out. Please try again.");
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
}

export async function extractReportWithOpenRouter(input: Parameters<typeof extractReportRequest>[0], scheduling: ProviderTaskOptions = {}) {
  return withAdmissionRetry(
    () => withProviderSlot(getOpenRouterConcurrency(), () => extractReportRequest(input), { ...scheduling, signal: input.signal }),
    { signal: input.signal },
  );
}
