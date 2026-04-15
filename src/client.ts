import OpenAI from "openai";
import type {
  ModeluxOptions,
  ModeluxParams,
  ModeluxMetadata,
  ModeluxChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
} from "./types.js";
import { BudgetExceededError } from "./errors.js";
import { ModeluxStream } from "./streaming.js";

const DEFAULT_BASE_URL = "https://api.modelux.ai/v1";

/**
 * Extract Modelux-specific parameters from the combined params object,
 * returning the clean OpenAI params and the extra headers to inject.
 */
function separateParams(
  params: ModeluxParams & Record<string, unknown>,
): { openaiParams: Record<string, unknown>; headers: Record<string, string> } {
  const { userId, tags, traceId, noCache, dryRun, ...openaiParams } = params;
  const headers: Record<string, string> = {};

  if (userId) headers["X-Modelux-User-Id"] = userId;
  if (tags) {
    headers["X-Modelux-User-Tags"] = Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }
  if (traceId) headers["X-Modelux-Trace-Id"] = traceId;
  if (noCache) headers["Cache-Control"] = "no-cache";
  if (dryRun) headers["X-Modelux-Dry-Run"] = "true";

  return { openaiParams, headers };
}

/**
 * Extract ModeluxMetadata from response headers.
 */
export function extractMetadata(headers: Headers): ModeluxMetadata {
  const cacheStatus = headers.get("x-modelux-cache");
  const cacheHit = cacheStatus === "HIT";
  const similarity = headers.get("x-modelux-cache-similarity");
  const budgetRemaining = headers.get("x-modelux-budget-remaining");

  return {
    request_id: headers.get("x-modelux-request-id") ?? "",
    provider_used: headers.get("x-modelux-provider-used") ?? "",
    model_used: headers.get("x-modelux-model-used") ?? "",
    cache_hit: cacheHit,
    ...(cacheHit && similarity != null && { cache_similarity: parseFloat(similarity) }),
    ...(headers.has("x-modelux-ab-variant") && {
      ab_variant: headers.get("x-modelux-ab-variant")!,
    }),
    ...(headers.has("x-modelux-budget-name") && {
      budget_name: headers.get("x-modelux-budget-name")!,
    }),
    ...(budgetRemaining != null && {
      budget_remaining: parseFloat(budgetRemaining),
    }),
    ...(headers.has("x-modelux-budget-action") && {
      budget_action: headers.get("x-modelux-budget-action") as ModeluxMetadata["budget_action"],
    }),
    ...(headers.has("x-modelux-budget-reset") && {
      budget_reset: headers.get("x-modelux-budget-reset")!,
    }),
  };
}

/**
 * Check for a 402 budget error in the OpenAI SDK's error and re-throw as BudgetExceededError.
 */
function handleBudgetError(err: unknown): never {
  if (
    err instanceof OpenAI.APIError &&
    err.status === 402
  ) {
    const body = err.error as {
      type?: string;
      message?: string;
      budget?: {
        name: string;
        spend_usd: number;
        cap_usd: number;
        period: "daily" | "weekly" | "monthly";
        period_resets_at: string;
      };
    };

    if (body?.budget) {
      const retryAfter = err.headers?.["retry-after"]
        ? parseInt(err.headers["retry-after"], 10)
        : null;
      throw new BudgetExceededError(
        body.message ?? "Budget exceeded",
        body.budget,
        retryAfter,
      );
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Chat completions namespace
// ---------------------------------------------------------------------------

class ChatCompletions {
  constructor(private client: OpenAI) {}

  /**
   * Create a chat completion (non-streaming).
   */
  async create(params: ChatCompletionCreateParams): Promise<ModeluxChatCompletion>;
  /**
   * Create a streaming chat completion.
   */
  async create(
    params: ChatCompletionCreateParamsStreaming & { stream: true },
  ): Promise<ModeluxStream>;
  async create(
    params: (ChatCompletionCreateParams | ChatCompletionCreateParamsStreaming) & {
      stream?: boolean;
    },
  ): Promise<ModeluxChatCompletion | ModeluxStream> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { openaiParams, headers } = separateParams(params as any);

    if (params.stream) {
      try {
        const response = await this.client.chat.completions
          .create(
            { ...openaiParams, stream: true } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
            { headers },
          )
          .withResponse();

        return new ModeluxStream(response.data, extractMetadata(response.response.headers));
      } catch (err) {
        handleBudgetError(err);
      }
    }

    try {
      const response = await this.client.chat.completions
        .create(
          { ...openaiParams, stream: false } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
          { headers },
        )
        .withResponse();

      const completion = response.data as ModeluxChatCompletion;
      completion.modelux = extractMetadata(response.response.headers);
      return completion;
    } catch (err) {
      handleBudgetError(err);
    }
  }
}

class Chat {
  completions: ChatCompletions;
  constructor(client: OpenAI) {
    this.completions = new ChatCompletions(client);
  }
}

// ---------------------------------------------------------------------------
// Main Modelux client
// ---------------------------------------------------------------------------

export class Modelux {
  chat: Chat;

  private _client: OpenAI;

  constructor(options: ModeluxOptions) {
    this._client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      timeout: options.timeout ?? 60_000,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch,
      defaultHeaders: {
        "X-Modelux-SDK": "typescript/0.1.0",
        ...options.defaultHeaders,
      },
    });

    this.chat = new Chat(this._client);
  }
}
