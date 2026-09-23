import { randomUUID } from "node:crypto";
import { providerMetric, safeMetricName, metricNumber, elapsedMs, beginHttp, type ProviderTrace } from "./provider-telemetry";
import { ProviderAdmissionError, retryAfterMs, withAdmissionRetry } from "./provider-retry";
import { withProviderSlot, type ProviderTaskOptions } from "./provider-concurrency";
import { educationOutputSchema, parseEducationOutput } from "./education-contract";
import "server-only";

import type { ChallengeModeDefinition } from "./challenge-modes";
import { resolveChallengeEvaluationModel } from "./model-options";
import {
  buildOpenRouterMessages,
  openRouterReasoningOptions,
  openRouterProviderOptions,
  type OpenRouterMessage,
} from "./openrouter-contract";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "qwen/qwen3.5-9b";
const defaultConcurrency = 10;
const requestTimeoutMs = 60000;

type OpenRouterResponse = {
  provider?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  choices?: Array<{
    finish_reason?: string;
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
  trace,
}: {
  prompt: string;
  reportText: string;
  model?: string;
  mode?: ChallengeModeDefinition;
  signal?: AbortSignal;
  trace?: ProviderTrace & {requestId:string;attempt:number};
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
  const started=performance.now();
  const http=beginHttp(trace?.batchId);
  let outcome="transport_error",status: number | undefined, headersMs: number | undefined, bodyMs: number | undefined, validationMs: number | undefined;
  let result: OpenRouterResponse | undefined;
  let rateRemainingRequests:number|undefined,rateRemainingTokens:number|undefined;
  providerMetric("http_start",{...trace,...{activeHttp:http.activeHttp,batchActiveHttp:http.batchActiveHttp}});

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
        ...(mode?.education ? { response_format: { type: "json_schema", json_schema: { name: "clinical_decisions", strict: true, schema: educationOutputSchema(mode) } }, provider: openRouterProviderOptions(model || getOpenRouterModel()) } : {}),
      }),
    });
  status=response.status;headersMs=elapsedMs(started);outcome="http_error";
  const remaining=(name:string)=>{const v=response.headers.get(name);return v===null?undefined:metricNumber(Number(v));};
  rateRemainingRequests=remaining("x-ratelimit-remaining-requests");rateRemainingTokens=remaining("x-ratelimit-remaining-tokens");
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

  outcome="invalid_response";
  const data = (await response.json()) as OpenRouterResponse;result=data;bodyMs=elapsedMs(started);
  const content = data.choices?.[0]?.message?.content;

  if (!content?.trim()) {
    throw new Error("OpenRouter returned an empty model output.");
  }

  const validationStart=performance.now();
  try { if (mode?.education) parseEducationOutput(content, mode); } finally { validationMs=elapsedMs(validationStart); }
  outcome="success";return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") { outcome=signal?.aborted?"cancelled":"timeout"; throw new Error(signal?.aborted ? "Evaluation cancelled." : "OpenRouter request timed out. Please try again."); }
    throw error;
  } finally {
    http.done();
    providerMetric("http_end",{...trace,outcome,status,rateRemainingRequests,rateRemainingTokens,headersMs,bodyMs,validationMs,httpMs:elapsedMs(started),provider:safeMetricName(result?.provider),finishReason:safeMetricName(result?.choices?.[0]?.finish_reason),inputTokens:metricNumber(result?.usage?.prompt_tokens),outputTokens:metricNumber(result?.usage?.completion_tokens),reasoningTokens:metricNumber(result?.usage?.completion_tokens_details?.reasoning_tokens),costUsd:metricNumber(result?.usage?.cost)});
    clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
}

export async function extractReportWithOpenRouter(input: Omit<Parameters<typeof extractReportRequest>[0], "trace">, scheduling: ProviderTaskOptions & {trace?:ProviderTrace} = {}) {
  const requestId=randomUUID(),start=performance.now();let attempts=0,queueMs=0,backoffMs=0,retryEnded: number | undefined;
  const {trace,...options}=scheduling;let outcome="failed";
  try {
    const result=await withAdmissionRetry(
      () => {
        if(retryEnded!==undefined){backoffMs+=elapsedMs(retryEnded);retryEnded=undefined;}
        const attempt=++attempts;const queuedAt=performance.now();let admitted=false;
        return withProviderSlot(getOpenRouterConcurrency(), () => extractReportRequest({...input,trace:{...trace,requestId,attempt}}), { ...options, signal: input.signal,
          onAdmission: timing=>{admitted=true;queueMs+=timing.queueWaitMs;providerMetric("admission",{...trace,requestId,attempt,...timing});options.onAdmission?.(timing);},
        }).finally(()=>{if(!admitted){const wait=elapsedMs(queuedAt);queueMs+=wait;providerMetric("queue_exit",{...trace,requestId,attempt,queueWaitMs:wait,outcome:"not_admitted"});}});
      },
      { signal: input.signal,onRetry:(delayMs,retry)=>{retryEnded=performance.now();providerMetric("retry",{...trace,requestId,retry,delayMs});} },
    );
    outcome="success";return result;
  } finally {
    if(retryEnded!==undefined)backoffMs+=elapsedMs(retryEnded);
    providerMetric("report_end",{...trace,requestId,model:safeMetricName(input.model||getOpenRouterModel()),outcome,attempts,retries:Math.max(0,attempts-1),queueMs,backoffMs,totalMs:elapsedMs(start)});
  }
}
