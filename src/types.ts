import type OpenAI from "openai";

// ---------------------------------------------------------------------------
// Modelux-specific parameters (injected as X-Modelux-* request headers)
// ---------------------------------------------------------------------------

export interface ModeluxParams {
  /** End-user identifier. Maps to X-Modelux-User-Id header. */
  userId?: string;
  /** Key-value tags for the end-user. Maps to X-Modelux-User-Tags header. */
  tags?: Record<string, string>;
  /** Correlation ID for distributed tracing. Maps to X-Modelux-Trace-Id header. */
  traceId?: string;
  /** Skip semantic cache for this request. Sets Cache-Control: no-cache. */
  noCache?: boolean;
  /** Run full routing pipeline without making an LLM call. Maps to X-Modelux-Dry-Run header. */
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Modelux response metadata (extracted from X-Modelux-* response headers)
// ---------------------------------------------------------------------------

export interface ModeluxMetadata {
  /** Unique request ID assigned by the proxy. */
  request_id: string;
  /** Provider that served the request (e.g. "openai", "anthropic"). */
  provider_used: string;
  /** Model that actually served the request. */
  model_used: string;
  /** Whether the response was served from semantic cache. */
  cache_hit: boolean;
  /** Cosine similarity score of the cache hit (0-1). Only present on cache hits. */
  cache_similarity?: number;
  /** A/B test variant label (e.g. "control", "variant_a"). Only present when an ab_test policy is active. */
  ab_variant?: string;
  /** Name of the matching budget, if any. */
  budget_name?: string;
  /** USD remaining in the budget period. */
  budget_remaining?: number;
  /** Budget enforcement action taken. */
  budget_action?: "block" | "downgrade" | "warn_only";
  /** When the budget period resets (ISO 8601). Only present on budget enforcement. */
  budget_reset?: string;
}

// ---------------------------------------------------------------------------
// Augmented response types
// ---------------------------------------------------------------------------

export type ModeluxChatCompletion = OpenAI.Chat.Completions.ChatCompletion & {
  modelux: ModeluxMetadata;
};

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface ModeluxOptions {
  /** Modelux proxy API key (mlx_sk_*). */
  apiKey: string;
  /** Proxy base URL. Defaults to https://api.modelux.ai/v1. */
  baseURL?: string;
  /** Request timeout in milliseconds. Defaults to 60000. */
  timeout?: number;
  /** Maximum number of retries on 429/5xx. Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch implementation (for testing or edge runtimes). */
  fetch?: typeof globalThis.fetch;
  /** Additional default headers sent on every request. */
  defaultHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Chat completion params (OpenAI params + Modelux extensions)
// ---------------------------------------------------------------------------

export type ChatCompletionCreateParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "stream"
> &
  ModeluxParams;

export type ChatCompletionCreateParamsStreaming = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  "stream"
> &
  ModeluxParams;
