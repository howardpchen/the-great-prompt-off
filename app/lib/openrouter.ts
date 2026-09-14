import { withProviderSlot } from "./provider-concurrency";
import { educationOutputSchema, parseEducationOutput } from "./education-contract";
import "server-only";

import type { ChallengeModeDefinition } from "./challenge-modes";
import { resolveChallengeEvaluationModel } from "./model-options";
import {
  buildOpenRouterMessages,
  type OpenRouterMessage,
} from "./openrouter-contract";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-2.0-flash-001";
const defaultConcurrency = 3;
const requestTimeoutMs = 30000;

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

  return Math.min(Math.max(parsed, 1), 10);
}

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

async function extractReportRequest({
  prompt,
  reportText,
  model,
  mode,
}: {
  prompt: string;
  reportText: string;
  model?: string;
  mode?: ChallengeModeDefinition;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when USE_REAL_LLM=true.");
  }

  const controller = new AbortController();
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
        temperature: 0,
        max_tokens: mode?.education ? Math.min(8192, 256 + mode.fields.length * 96) : 300,
        ...(mode?.education ? { response_format: { type: "json_schema", json_schema: { name: "clinical_decisions", strict: true, schema: educationOutputSchema(mode) } }, provider: { require_parameters: true } } : {}),
      }),
    });
  if (!response.ok) {
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
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenRouter request timed out. Please try again.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function extractReportWithOpenRouter(input: Parameters<typeof extractReportRequest>[0]) {
  return withProviderSlot(getOpenRouterConcurrency(), () => extractReportRequest(input));
}
